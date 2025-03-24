const buildFromFolder = require("models/template").buildFromFolder;
const Blog = require("models/blog");
const Update = require("./update");
const Rename = require("./rename");
const localPath = require("helper/localPath");
const renames = require("./renames");
const lockfile = require("proper-lockfile");
const type = require("helper/type");
const messenger = require("./messenger");

function sync (blogID, callback) {
  if (!type(callback, "function")) {
    throw new TypeError(
      "Expected callback with type:Function as second argument"
    );
  }

  if (!type(blogID, "string")) {
    return callback(
      new TypeError("Expected blogID with type:String as first argument")
    );
  }

  Blog.get({ id: blogID }, async function (err, blog) {
    // It would be nice to get an error from Blog.get instead of this...
    if (err || !blog || !blog.id || blog.isDisabled) {
      const message = "Cannot sync blog " + blogID;
      const error = new Error(message);
      console.log(error);
      return callback(error);
    }

    const { log, status } = messenger(blog);

    log("Starting sync");

    let release;

    try {
      log("Acquiring lock on folder");
      release = await lockfile.lock(localPath(blogID, "/"), {
        stale: 20 * 1000, // 20 seconds, Duration in milliseconds in which the lock is considered stale
        update: 5 * 1000, // 5 seconds, The interval in milliseconds in which the lockfile's mtime will be updated
        retries: {
          retries: 3,
          factor: 2,
          minTimeout: 100,
          maxTimeout: 200,
          randomize: true
        },
        onCompromised: err => {
          // Log will be prefixed with sync_id and blog.id
          // to help us understand what went wrong...
          log("Lock on folder compromised");
          throw err;
        }
      });
      log("Successfully acquired lock on folder");
    } catch (e) {
      log("Failed to acquire lock on folder");
      return callback(new Error("Failed to acquire folder lock"));
    }

    // we want to know if folder.update or folder.rename is called
    let changes = false;
    let _update = new Update(blog, log, status);
    let _rename = Rename(blog, log);

    const folder = {
      path: localPath(blogID, "/"),
      rename: function () {
        changes = true;
        // pass the arguments given to folder.rename to _rename
        _rename.apply(_rename, arguments);
      },
      update: function () {
        changes = true;
        // pass the arguments given to folder.update to _update
        _update.apply(_update, arguments);
      },
      status,
      log
    };

    const timeout = setTimeout(function () {
      log("Warning: sync exceeded 10 minutes");
      // email.LONG_SYNC();
    }, 10 * 60 * 1000); // 10 minutes

    // Right now localPath returns a path with a trailing slash for some
    // crazy reason. This means that we need to remove the trailing
    // slash for this to work properly. In future, you should be able
    // to remove this line when localPath works properly.
    if (folder.path.slice(-1) === "/") folder.path = folder.path.slice(0, -1);

    // We acquired a lock on the resource!
    // This function is to be called when we are finished
    // with the lock on the user's folder.
    folder.status("Syncing");

    // Pass methods to trigger folder updates back to the
    // function which wanted to modify the blog's folder.
    callback(null, folder, function (syncError, callback) {
      log("Sync callback invoked");
      folder.status("Synced");

      if (typeof syncError === "function")
        throw new Error("Pass an error or null as first argument to done");

      if (typeof callback !== "function")
        throw new Error("Pass a callback to done");

      log("Checking for renamed files");
      renames(blogID, async function (err) {
        if (err) {
          folder.status("Error checking file renames");
          log("Error checking file renames");
          console.log(err);
        }

        // What is the appropriate order for this?
        log("Building templates from folder");
        buildFromFolder(blogID, async function (err) {
          if (err) {
            folder.status("Error building templates from folder");
            log("Error building templates in folder");
            console.log(err);
          }

          // We could do these next two things in parallel
          // but it's a little bit of refactoring...
          log("Releasing lock");
          await release();
          clearTimeout(timeout);
          log("Finished sync");

          if (!changes) {
            return callback(syncError);
          }

          const cacheID = Date.now();

          // Passing in cacheID manually busts the cache.
          // Since Blog.set and Blog.flushCache depend on each other
          // we can't put this there. Ideally we would expose a single function to
          // wipe the cache. So fix that eventually...
          log("Updating cacheID of blog");
          Blog.set(blogID, { cacheID }, async function (err) {
            if (err) {
              log("Error updating cacheID of blog");
              log("Releasing lock");
            }
            callback(syncError);
          });
        });
      });
    });
  });
}

module.exports = sync;
