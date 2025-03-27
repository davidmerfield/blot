var fs = require("fs-extra");
var localPath = require("helper/localPath");
var clfdate = require("helper/clfdate");
var hashFile = require("helper/hashFile");
var drop = require("./drop");
var set = require("./set");
var flushCache = require("models/blog/flushCache");
var pathNormalizer = require("helper/pathNormalizer");

module.exports = function (blog, log, status) {
  return function update(path, callback) {
    // if typoeof callback is not function, throw error
    if (typeof callback !== "function") {
      throw new Error("sync.update: callback must be a function");
    }

    // if typeof path is not string, return error
    if (typeof path !== "string") {
      return callback(new Error("sync.update: path must be a string"));
    }

    path = pathNormalizer(path);

    status("Syncing " + path);

    hashFile(localPath(blog.id, path), function (err, hashBefore) {
      function done(err) {
        // we never let this error escape out
        if (err) {
          console.error(clfdate(), blog.id, path, err);
        }
        hashFile(localPath(blog.id, path), function (err, hashAfter) {
          if (hashBefore !== hashAfter) {
            status("Re-syncing " + path);
            return update(path, callback);
          }

          // the cache is flushed at the end of a sync too
          // but if we don't do it after updating each files
          // long syncs can produce weird cache behaviour
          flushCache(blog.id, function () {
            callback(null, { error: err || null });
          });
        });
      }

      fs.stat(localPath(blog.id, path), function (err, stat) {
        if (err && err.code === "ENOENT") {
          log(path, "Dropping from database");
          drop(blog.id, path, function (err) {
            if (err) {
              log(path, "Error dropping from database", err);
            } else {
              log(path, "Dropping from database succeeded");
            }
            done(err);
          });
        } else if (stat && stat.isDirectory()) {
          // there is nothing to do for directories
          done();
        } else {
          log(path, "Saving file in database");
          set(blog, path, function (err) {
            if (err) {
              log(path, "Error saving file in database", err);
            } else {
              log(path, "Saving file in database succeeded");
            }
            done(err);
          });
        }
      });
    });
  };
};
