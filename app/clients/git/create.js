const async = require("async");
const fs = require("fs-extra");
const Git = require("simple-git");
const database = require("./database");
const localPath = require("helper/localPath");
const dataDir = require("./dataDir");
const clfdate = require("helper/clfdate");
const sync = require("sync");
const shouldIgnoreFile = require("../util/shouldIgnoreFile");

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
                "The live repository directory is not owned by the current user."
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
        bareRepo = Git(bareRepoDirectory);
        liveRepo = Git(liveRepoDirectory);
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
            try {
              await addFolder(folder, liveRepo);
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

async function addFolder(folder, liveRepo) {
  async function walk(dir) {
    const files = (await fs.readdir(dir))
      .filter((file) => !shouldIgnoreFile(file))
      .sort();

    if (!files.length && dir === folder.path) {
      console.log(
        clfdate() + " Git: addFolder: folder is empty, creating initial commit"
      );
      // If the folder is empty, create an initial commit
      return handleEmptyFolder(folder, liveRepo);
    }

    for (const file of files) {
      const filePath = `${dir}/${file}`;
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        await walk(filePath);
      } else {
        await addFile(folder, liveRepo, filePath);
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
  return new Promise((resolve, reject) => {
    folder.status("Initial commit to repository");
    liveRepo.commit(
      "Initial commit",
      { "--allow-empty": true },
      function (err) {
        if (err) return reject(new Error(err));
        liveRepo.push(["-u", "origin", "master"], function (err) {
          if (err) return reject(new Error(err));
          folder.status("Created initial commit in empty repository");
          resolve();
        });
      }
    );
  });
}
async function addFile(folder, liveRepo, path) {
  return new Promise((resolve, reject) => {
    const relativePath = path.replace(folder.path + "/", "");
    folder.status("Adding " + relativePath + " to repository");
    liveRepo.add(path, function (err) {
      if (err) return reject(new Error(err));
      liveRepo.commit("Add " + relativePath, function (err) {
        if (err) return reject(new Error(err));
        liveRepo.push(["-u", "origin", "master"], function (err) {
          if (err) return reject(new Error(err));
          resolve();
        });
      });
    });
  });
}
