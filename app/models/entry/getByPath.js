var ensure = require("helper/ensure");
var pathNormalizer = require("helper/pathNormalizer");
var redis = require("models/client");
var get = require("./get");

// Resolve an entry path without regard to case, returning the entry stored at
// its canonical (true-case) path. The all list is intentional: callers still
// need to be able to distinguish deleted, draft, and scheduled entries.
module.exports = function getByPath(blogID, path, callback) {
  ensure(blogID, "string").and(path, "string").and(callback, "function");

  var normalizedPath = pathNormalizer(path);

  get(blogID, normalizedPath, function (entry) {
    if (entry) return callback(entry);

    redis
      .zRange("blog:" + blogID + ":all", 0, -1)
      .then(function (paths) {
        var lowerPath = normalizedPath.toLowerCase();
        var canonicalPath = (paths || []).find(function (candidate) {
          return pathNormalizer(candidate).toLowerCase() === lowerPath;
        });

        if (!canonicalPath) return callback();
        get(blogID, canonicalPath, callback);
      })
      .catch(function (err) {
        console.error(err);
        callback();
      });
  });
};
