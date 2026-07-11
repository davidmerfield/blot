const { promisify } = require("util");
const fs = require("fs-extra");
const Git = require("simple-git");
const database = require("./database");
const localPath = require("helper/localPath");
const dataDir = require("./dataDir");
const clfdate = require("helper/clfdate");
const sync = require("sync");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");
const path = require("path");

const GC_INTERVAL = 100;
const COMMIT_RETRY_DELAYS_MS = [1000, 2000, 3000];

const TEMPORARY_GIT_GC_CONFIG = [
  ["gc.auto", "0"],
  ["gc.autoDetach", "false"],
  ["maintenance.auto", "false"],
  ["maintenance.autoDetach", "false"],
];
const setStatus = promisify(database.setStatus.bind(database));
const createToken = promisify(database.createToken.bind(database));

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function isTransientCommitError(err) {
  const msg = String(err && err.message);
  return (
    /is not a valid object/i.test(msg) ||
    /nonexistent object [0-9a-f]{40}/i.test(msg)
  );
}

async function createEmptyCommit(repo, message) {
  await repo.commit(message, { "--allow-empty": true });
}

async function pushMaster(repo) {
  await repo.push(["-u", "origin", "master"]);
}

async function configureTemporaryGitGc(repo) {
  for (const [key, value] of TEMPORARY_GIT_GC_CONFIG) {
    await repo.raw(["config", "--local", key, value]);
  }
}

async function unsetTemporaryGitGc(repo) {
  await Promise.allSettled(
    TEMPORARY_GIT_GC_CONFIG.map(([key]) =>
      repo.raw(["config", "--local", "--unset", key])
    )
  );
}

async function commitFileWithRetries(repo, relativePath) {
  for (let attempt = 0; ; attempt++) {
    try {
      await repo.raw(["commit", "--allow-empty", "-m", "Add file"]);
      if (attempt > 0) {
        console.log(
          clfdate() +
            " Git: create: commit succeeded on attempt " +
            (attempt + 1) +
            " " +
            relativePath
        );
      }
      return;
    } catch (err) {
      const delayMs = COMMIT_RETRY_DELAYS_MS[attempt];

      if (!delayMs || !isTransientCommitError(err)) {
        throw err;
      }

      console.log(
        clfdate() +
          " Git: create: commit retry " +
          (attempt + 1) +
          "/" +
          COMMIT_RETRY_DELAYS_MS.length +
          " in " +
          delayMs +
          "ms " +
          relativePath +
          " err=" +
          err.message
      );
      await delay(delayMs);
    }
  }
}

module.exports = function create(blog, callback) {
  sync(blog.id, async function (err, folder, done) {
    if (err) return callback(err);

    const liveDirectory = localPath(blog.id, "/");
    const bareDirectory = `${dataDir}/${blog.handle}.git`;

    try {
      await createRepository(blog, folder);
      done(null, callback);
    } catch (err) {
      await cleanupFailedRepository(blog, liveDirectory, bareDirectory);
      done(err, callback);
    }
  });
};

async function createRepository(blog, folder) {
  const liveDirectory = localPath(blog.id, "/");
  const bareDirectory = `${dataDir}/${blog.handle}.git`;

  report(folder, "Making bare repository directory and creating token");
  await prepareDirectoriesAndMetadata(blog, liveDirectory, bareDirectory);

  const bareRepo = Git(bareDirectory, { maxConcurrentProcesses: 1 });
  const liveRepo = Git(liveDirectory, { maxConcurrentProcesses: 1 });

  report(folder, "Creating bare repository", "initing bareRepo");
  await bareRepo.init(true);

  report(folder, "Creating live repository", "initing liveRepo");
  await liveRepo.init();

  report(folder, "Adding remote to live repository", "adding remote to liveRepo");
  await liveRepo.addRemote("origin", bareDirectory);

  report(folder, "Configuring temporary Git GC settings");
  await configureTemporaryGitGc(liveRepo);

  try {
    report(folder, "Adding existing folder to live repository");
    const progress = { filesAdded: 0 };
    await addFolder(folder, liveRepo, progress);

    await unsetTemporaryGitGc(liveRepo);
  } catch (err) {
    await unsetTemporaryGitGc(liveRepo);
    throw err;
  }

  await setStatus(blog.owner, "createComplete");

  console.log(clfdate() + " Git: create: done");
  // The delay ensures the page reloads – for empty folders this function returns
  // immediately and the page which displays the status message doesn't reload in
  // time.
  await delay(1000);
  folder.status("Repository created successfully");
}

async function prepareDirectoriesAndMetadata(blog, liveDirectory, bareDirectory) {
  await Promise.all([
    fs.mkdir(bareDirectory),
    setStatus(blog.owner, "createInProgress"),
    createToken(blog.owner),
    assertDirectoryOwnership(liveDirectory),
  ]);
}

async function assertDirectoryOwnership(liveDirectory) {
  const stats = await fs.stat(liveDirectory);

  if (stats.uid !== process.getuid()) {
    throw new Error(
      "The live repository directory is not owned by the current user. uid: " +
        stats.uid +
        " process.getuid(): " +
        process.getuid() +
        " process.getgid(): " +
        process.getgid()
    );
  }
}

async function cleanupFailedRepository(blog, liveDirectory, bareDirectory) {
  const liveRepo = Git(liveDirectory, { maxConcurrentProcesses: 1 });

  await unsetTemporaryGitGc(liveRepo);

  await Promise.allSettled([
    fs.remove(bareDirectory),
    fs.remove(`${liveDirectory}/.git`),
    setStatus(blog.owner, "createFailed"),
  ]);
}

function report(folder, message, logMessage = message) {
  console.log(`${clfdate()} Git: create: ${logMessage}`);
  folder.status(message);
}

async function addFolder(folder, liveRepo, progress) {
  async function walk(dir) {
    const entries = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((entry) => !shouldIgnoreFile(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!entries.length && dir === folder.path) {
      console.log(
        clfdate() + " Git: addFolder: folder is empty, creating initial commit"
      );
      // If the folder is empty, create an initial commit
      return handleEmptyFolder(folder, liveRepo);
    }

    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(filePath);
      } else if (entry.isFile()) {
        await addFile(folder, liveRepo, progress, filePath);
      }
    }
  }

  try {
    await walk(folder.path);
  } catch (err) {
    throw new Error("Error while adding files to repository: " + err.message);
  }
}

async function handleEmptyFolder(folder, liveRepo) {
  folder.status("Initial commit to repository");

  await createEmptyCommit(liveRepo, "Initial commit");
  await pushMaster(liveRepo);

  folder.status("Created initial commit in empty repository");
}

async function addFile(folder, liveRepo, progress, filePath) {
  const relativePath = path.relative(folder.path, filePath);
  const untilGc =
    GC_INTERVAL - (progress.filesAdded % GC_INTERVAL || GC_INTERVAL);

  console.log(
    clfdate() +
      " Git: create: starting file #" +
      (progress.filesAdded + 1) +
      " (" +
      untilGc +
      " successful files until gc)"
  );

  folder.status("Adding " + relativePath + " to repository");

  try {
    await liveRepo.add(filePath);
  } catch (err) {
    console.log(
      "Failed to add file " + relativePath + " to repository: " + err.message
    );
    throw err;
  }

  folder.status("Added " + relativePath + " to repository");

  try {
    await commitFileWithRetries(liveRepo, relativePath);
  } catch (err) {
    console.log(
      "Failed to commit file " +
        relativePath +
        " to repository: " +
        err.message
    );
    throw err;
  }

  folder.status("Committed " + relativePath + " to repository");

  try {
    await pushMaster(liveRepo);
  } catch (err) {
    console.log(
      "Failed to push file " + relativePath + " to repository: " + err.message
    );
    throw err;
  }

  folder.status("Pushed " + relativePath + " to repository");

  progress.filesAdded++;

  if (progress.filesAdded % GC_INTERVAL === 0) {
    folder.status("Running git gc after " + progress.filesAdded + " files");
    console.log(
      clfdate() +
        " Git: create: git gc before (file #" +
        progress.filesAdded +
        ")"
    );
    await liveRepo.raw(["gc"]);
    console.log(
      clfdate() +
        " Git: create: git gc after (file #" +
        progress.filesAdded +
        ")"
    );
    folder.status("Finished git gc after " + progress.filesAdded + " files");
  } else {
    const remaining = GC_INTERVAL - (progress.filesAdded % GC_INTERVAL);
    console.log(
      clfdate() +
        " Git: create: " +
        progress.filesAdded +
        " files done, " +
        remaining +
        " until gc"
    );
    if (remaining <= 10) {
      folder.status(
        progress.filesAdded + " files done, " + remaining + " until git gc"
      );
    }
  }
}
