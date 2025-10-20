var path = require("path");
var spawn = require("child_process").spawn;
var resetToBlot = require("clients/dropbox/sync/reset-to-blot");
var get = require("../get/blog");
var each = require("../each/blog");
var async = require("async");
console.warn("Warning: this uses an internal method of the Dropbox client.");
console.log('Consider debugging with "export DEBUG=clients:dropbox*"');

function runFixEntryDates(blogID, callback) {
  var scriptPath = path.join(__dirname, "fix-entry-dates.js");
  var child = spawn(process.execPath, [scriptPath, blogID], {
    stdio: "inherit",
  });

  child.on("error", callback);
  child.on("close", function (code) {
    if (code !== 0) {
      return callback(new Error("fix-entry-dates exited with code " + code));
    }

    callback();
  });
}

function runFullSync(blog, callback) {
  var publish = function () {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(
      console,
      ["Dropbox sync", blog.title, blog.id + ":"].concat(args)
    );
  };

  resetToBlot(blog.id, publish).then(
    function () {
      callback();
    },
    function (err) {
      callback(err);
    }
  );
}

if (process.argv[2]) {
  get(process.argv[2], function (err, user, blog) {
    if (err) throw err;
    runFullSync(blog, function (err) {
      if (err) throw err;
      runFixEntryDates(blog.id, function (fixErr) {
        if (fixErr) {
          console.error(
            "Error fixing entry dates for blog",
            blog.title,
            blog.id,
            "-",
            fixErr.message || fixErr
          );
          process.exit(1);
        }

        process.exit();
      });
    });
  });
} else {
  var blogs = [];

  each(
    function (user, blog, next) {
      if (blog.client === "dropbox") blogs.push(blog);
      next();
    },
    function () {
      // Sort blogs to sync least recently synced first
      blogs.sort(function (a, b) {
        return a.cacheID > b.cacheID ? 1 : -1;
      });

      async.eachSeries(
        blogs,
        function (blog, next) {
          console.log("Syncing", blog.title, blog.id, new Date(blog.cacheID));
          runFullSync(blog, function (err) {
            if (err) {
              console.error(
                "Error syncing blog",
                blog.title,
                blog.id,
                "-",
                err.message || err
              );
              return next();
            }

            runFixEntryDates(blog.id, function (fixErr) {
              if (fixErr) {
                console.error(
                  "Error fixing entry dates for blog",
                  blog.title,
                  blog.id,
                  "-",
                  fixErr.message || fixErr
                );
              }

              next();
            });
          });
        },
        function (err) {
          if (err) {
            console.error("Sync finished with error", err.message || err);
          }
          console.log("Done!");
          process.exit();
        }
      );
    }
  );
}
