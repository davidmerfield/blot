const async = require("async");
const fs = require("fs-extra");
const Git = require("simple-git");
const database = require("./database");
const localPath = require("helper/localPath");
const dataDir = require("./dataDir");
const clfdate = require("helper/clfdate");
const sync = require("sync");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

const GC_INTERVAL = 100;
const COMMIT_INVALID_OBJECT_RETRIES = 3;
const COMMIT_RETRY_DELAYS_MS = [1000, 2000, 3000];

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

function commitFile(liveRepo) {
  return new Promise(function (resolve, reject) {
    liveRepo.raw(["commit", "--allow-empty", "-m", "Add file"], function (err) {
      if (err) return reject(new Error(err));
      resolve();
    });
  });
}

async function commitFileWithRetries(liveRepo, relativePath) {
  const maxAttempts = COMMIT_INVALID_OBJECT_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await commitFile(liveRepo);
      if (attempt > 1) {
        console.log(
          clfdate() +
            " Git: create: commit succeeded on attempt " +
            attempt +
            " " +
            relativePath
        );
      }
      return;
    } catch (err) {
      if (!isTransientCommitError(err) || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = COMMIT_RETRY_DELAYS_MS[attempt - 1];
      console.log(
        clfdate() +
          " Git: create: commit retry " +
          attempt +
          "/" +
          COMMIT_INVALID_OBJECT_RETRIES +
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
  var bareRepo;
  var liveRepo;

  sync(blog.id, async function (err, folder, done) {
    if (err) return callback(err);

    const liveRepoDirectory = localPath(blog.id, "/");
    const bareRepoDirectory = dataDir + "/" + blog.handle + ".git";

    // If we encounter an error, ensure we remove the bare repository directory
    // and the live repository (not the files, just the git metadata) before calling
    // the callback with the error.
    async function cleanupAndCallback(err) {
      await fs.remove(bareRepoDirectory);
      await fs.remove(liveRepoDirectory + "/.git");
      database.setStatus(blog.owner, "createFailed", function () {});
      done(err, callback);
    }

    var queue = [
      fs.mkdir.bind(this, bareRepoDirectory),
      database.setStatus.bind(this, blog.owner, "createInProgress"),
      database.createToken.bind(this, blog.owner),
      // Verify that the owner of the live repo directory is the same as the current user
      function (callback) {
        fs.stat(liveRepoDirectory, function (err, stats) {
          if (err) return callback(err);
          if (stats.uid !== process.getuid()) {
            return callback(
              new Error(
                "The live repository directory is not owned by the current user. uid: " + stats.uid + " process.getuid(): " + process.getuid() + " process.getgid(): " + process.getgid()
              )
            );
          }
          callback();
        });
      },
    ];

    console.log(
      clfdate() + " Git: create: making bareRepoDirectory and creating token"
    );

    async.parallel(queue, function (err) {
      if (err) return cleanupAndCallback(err);

      try {
        // Initialize bare repo first
        bareRepo = Git(bareRepoDirectory, { maxConcurrentProcesses: 1 });
        liveRepo = Git(liveRepoDirectory, { maxConcurrentProcesses: 1 });
      } catch (err) {
        return cleanupAndCallback(
          new Error("Failed to initialize Git repositories: " + err.message)
        );
      }

      // Create bare repository first
      console.log(clfdate() + " Git: create: initing bareRepo");
      folder.status("Creating bare repository");

      bareRepo.init(true, function (err) {
        if (err) return cleanupAndCallback(new Error(err));

        console.log(clfdate() + " Git: create: initing liveRepo");
        folder.status("Creating live repository");
        liveRepo.init(function (err) {
          if (err) return cleanupAndCallback(new Error(err));

          console.log(clfdate() + " Git: create: adding remote to liveRepo");
          folder.status("Adding remote to live repository");
          liveRepo.addRemote("origin", bareRepoDirectory, async function (err) {
            if (err) return cleanupAndCallback(new Error(err));

            console.log(
              clfdate() + " Git: create: adding existing folder to liveRepo"
            );

            folder.status("Adding existing folder to live repository");
            const repoContext = {
              liveRepoDirectory: liveRepoDirectory,
              bareRepoDirectory: bareRepoDirectory,
              liveRepo: liveRepo,
              bareRepo: bareRepo,
              addFileCount: 0,
            };
            try {
              await addFolder(folder, liveRepo, repoContext);
            } catch (err) {
              return cleanupAndCallback(
                new Error(
                  "Failed to add folder to live repository: " + err.message
                )
              );
            }
            database.setStatus(blog.owner, "createComplete", function (err) {
              if (err) return cleanupAndCallback(new Error(err));

              console.log(clfdate() + " Git: create: done");
              // The delay ensures the page reloads – for empty folders
              // this function returns immediately and the page which displays
              // the status message doesn't reload in time.
              setTimeout(() => {
                folder.status("Repository created successfully");
                done(null, callback);
              }, 1000);
            });
          });
        });
      });
    });
  });
};

async function addFolder(folder, liveRepo, repoContext) {
  async function walk(dir) {
    const files = (await fs.readdir(dir))
      .filter((file) => !shouldIgnoreFile(file))
      .sort();

    if (!files.length && dir === folder.path) {
      console.log(
        clfdate() + " Git: addFolder: folder is empty, creating initial commit"
      );
      // If the folder is empty, create an initial commit
      return handleEmptyFolder(folder, liveRepo, repoContext);
    }

    for (const file of files) {
      const filePath = `${dir}/${file}`;
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        await walk(filePath);
      } else {
        await addFile(folder, liveRepo, repoContext, filePath);
      }
    }
  }

  try {
    await walk(folder.path);
  } catch (err) {
    throw new Error("Error while adding files to repository: " + err.message);
  }
}

async function handleEmptyFolder(folder, liveRepo, repoContext) {
  folder.status("Initial commit to repository");

  await new Promise(function (resolve, reject) {
    liveRepo.commit(
      "Initial commit",
      { "--allow-empty": true },
      function (err) {
        if (err) return reject(new Error(err));
        resolve();
      }
    );
  });

  await new Promise(function (resolve, reject) {
    liveRepo.push(["-u", "origin", "master"], function (err) {
      if (err) return reject(new Error(err));
      resolve();
    });
  });

  folder.status("Created initial commit in empty repository");
}

async function addFile(folder, liveRepo, repoContext, path) {
  const relativePath = path.replace(folder.path + "/", "");
  const untilGc =
    GC_INTERVAL - (repoContext.addFileCount % GC_INTERVAL || GC_INTERVAL);

  console.log(
    clfdate() +
      " Git: create: starting file #" +
      (repoContext.addFileCount + 1) +
      " (" +
      untilGc +
      " successful files until gc)"
  );

  folder.status("Adding " + relativePath + " to repository");

  try {
    await new Promise((resolve, reject) => {
      liveRepo.add(path, function (err) {
        if (err) return reject(new Error(err));
        resolve();
      });
    });
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
    await new Promise(function (resolve, reject) {
      liveRepo.push(["-u", "origin", "master"], function (err) {
        if (err) return reject(new Error(err));
        resolve();
      });
    });
  } catch (err) {
    console.log(
      "Failed to push file " + relativePath + " to repository: " + err.message
    );
    throw err;
  }

  folder.status("Pushed " + relativePath + " to repository");

  repoContext.addFileCount++;

  if (repoContext.addFileCount % GC_INTERVAL === 0) {
    folder.status("Running git gc after " + repoContext.addFileCount + " files");
    console.log(
      clfdate() +
        " Git: create: git gc before (file #" +
        repoContext.addFileCount +
        ")"
    );
    await new Promise(function (resolve, reject) {
      liveRepo.raw(["gc"], function (err) {
        if (err) return reject(new Error(err));
        resolve();
      });
    });
    console.log(
      clfdate() +
        " Git: create: git gc after (file #" +
        repoContext.addFileCount +
        ")"
    );
    folder.status("Finished git gc after " + repoContext.addFileCount + " files");
  } else {
    const remaining = GC_INTERVAL - (repoContext.addFileCount % GC_INTERVAL);
    console.log(
      clfdate() +
        " Git: create: " +
        repoContext.addFileCount +
        " files done, " +
        remaining +
        " until gc"
    );
    if (remaining <= 10) {
      folder.status(
        repoContext.addFileCount + " files done, " + remaining + " until git gc"
      );
    }
  }
}
