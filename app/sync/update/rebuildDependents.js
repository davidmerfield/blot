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
  "TOO_MANY_FILES",
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
    (async function () {
      try {
        const dependent_paths = await client.sMembers(dependentsKey(blogID, path));

        async.eachSeries(
          dependent_paths,
          function (dependent_path, next) {
            Entry.get(blogID, dependent_path, function (entry) {
              if (!entry) {
                log("No entry for dependent_path:", dependent_path);
                return next();
              }

              // A folder post lives at a plus-stripped path that does not
              // exist on disk (e.g. the aggregate for /album+ is stored at
              // /album). Rebuild it through its source folder so that
              // changing a referenced asset does not make build() fail with
              // ENOENT/WRONGTYPE and delete the still-valid aggregate.
              var folderSource = folderPostSource(entry);
              var buildPath = folderSource || dependent_path;

              build(blog, buildPath, function (err, updated_dependent) {
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

                if (
                  folderSource &&
                  updated_dependent.metadata &&
                  updated_dependent.metadata._sourcePaths
                ) {
                  delete updated_dependent.metadata._sourcePaths;
                }

                Entry.set(
                  blogID,
                  updated_dependent.path || dependent_path,
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
      } catch (err) {
        callback(err);
      }
    })();
  });
};

// If the stored entry is a folder post, return the "+" source folder it was
// built from (read off the data-folder attribute in its generated HTML).
function folderPostSource(entry) {
  var html = entry && entry.html;

  if (typeof html !== "string") return null;
  if (html.indexOf('class="multi-file-post"') === -1) return null;

  var match = html.match(/<section class="multi-file-post"[^>]*\sdata-folder="([^"]*)"/);

  if (!match) return null;

  return String(match[1])
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

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
