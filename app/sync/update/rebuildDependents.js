var async = require("async");
var Entry = require("models/entry");
var client = require("models/client");
var Blog = require("models/blog");
var build = require("build");
var dependentsKey = Entry.key.dependents;
const clfdate = require("helper/clfdate");
var Preview = require("./preview");
var isHidden = require("build/prepare/isHidden");

var NO_LONGER_VALID_ERRORS = [
  "WRONGTYPE",
  "ENOENT",
  "EMPTY",
  "ENOTDIR",
  "EISDIR",
];

// The purpose of this module is to rebuild any
// entries already in the user's folder which depend
// on the contents of this particular file which was
// just changed or removed.

module.exports = function (blogID, path, callback) {
  const log = function () {
    console.log.apply(null, [
      clfdate(),
      blogID.slice(0, 12),
      "rebuildDependents:",
      path,
      ...arguments,
    ]);
  };
  Blog.get({ id: blogID }, function (err, blog) {
    if (err || !blog) return callback(err || new Error("No blog"));
    client.SMEMBERS(dependentsKey(blogID, path), function (
      err,
      dependent_paths
    ) {
      if (err) return callback(err);

      async.eachSeries(
        dependent_paths,
        function (dependent_path, next) {
          Entry.get(blogID, dependent_path, function (entry) {
            if (!entry) {
              log("No entry for dependent_path:", dependent_path);
              return next();
            }

            build(blog, dependent_path, function (err, updated_dependent) {
              if (err) {
                log("Error rebuilding dependent_path:", dependent_path, err);

                if (shouldDropDependent(err)) {
                  dropDependent(blogID, dependent_path, function (dropErr) {
                    if (dropErr)
                      log(
                        "Error dropping invalid dependent:",
                        dependent_path,
                        dropErr
                      );
                    next();
                  });
                } else {
                  next();
                }

                return;
              }

              Entry.set(
                blogID,
                dependent_path,
                updated_dependent,
                function (err) {
                  if (err) log("Error saving dependent_path entry", err);

                  next();
                },
                false
              );
            });
          });
        },
        callback
      );
    });
  });
};

function shouldDropDependent(err) {
  if (!err) return false;

  var code = err.code || err.cause || "";

  if (typeof code === "string") {
    code = code.toString().toUpperCase();
    return NO_LONGER_VALID_ERRORS.indexOf(code) !== -1;
  }

  return false;
}

function dropDependent(blogID, path, callback) {
  Entry.get(blogID, path, function (entry) {
    if (!entry) return callback();

    Entry.drop(blogID, path, function (err) {
      if (err) return callback(err);

      if (entry.draft && !isHidden(path)) {
        Preview.remove(blogID, path, callback);
      } else {
        callback();
      }
    });
  });
}
