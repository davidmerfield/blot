module.exports = (function () {
  var redis = require("models/client"),
    normalize = require("helper/pathNormalizer"),
    ensure = require("helper/ensure"),
    REASONS = {
      TOO_LARGE: {
        message: "too large",
        url: "/help",
      },
      WRONG_TYPE: {
        message: "not a file Blot can process",
        url: "/help",
      },
      PUBLIC_FILE: {
        message: "a public file",
        url: "/help",
      },
    };

  function add(blogID, path, reason, callback) {
    ensure(blogID, "string")
      .and(path, "string")
      .and(reason, "string")
      .and(callback, "function");

    path = normalize(path);

    redis.hset(ignoredFilesKey(blogID), path, reason, function (err) {
      if (err) throw err;
      callback();
    });
  }

  function drop(blogID, path, callback) {
    ensure(blogID, "string").and(path, "string").and(callback, "function");

    path = normalize(path);

    redis.hdel(ignoredFilesKey(blogID), path, function (err, stat) {
      if (err) throw err;

      callback();
    });
  }

  function get(blogID, callback) {
    ensure(blogID, "string").and(callback, "function");

    redis.hgetall(ignoredFilesKey(blogID), function (error, ignoredFiles) {
      callback(error, ignoredFiles || {});
    });
  }

  function flush(blogID, callback) {
    ensure(blogID, "string").and(callback, "function");

    redis.del(ignoredFilesKey(blogID), callback);
  }

  function getArray(blogID, callback) {
    ensure(blogID, "string").and(callback, "function");

    get(blogID, function (err, ignoredFiles) {
      if (err) return callback(err);

      var ignoredFileList = [];

      for (var path in ignoredFiles) {
        var reasonCode = ignoredFiles[path];
        var reason = REASONS[reasonCode] && REASONS[reasonCode].message;
        var url = REASONS[reasonCode] && REASONS[reasonCode].url;

        if (reason)
          ignoredFileList.push({
            path: path.slice(1),
            reason: reason,
            url: url,
          });
      }

      callback(null, ignoredFileList);
    });
  }

  function getStatus(blogID, path, callback) {
    ensure(blogID, "string").and(path, "string").and(callback, "function");

    path = normalize(path);

    redis.hget(ignoredFilesKey(blogID), path, callback);
  }

  function isIt(blogID, path, callback) {
    ensure(blogID, "string").and(path, "string").and(callback, "function");

    path = normalize(path);

    redis.hexists(ignoredFilesKey(blogID), path, function (err, exists) {
      return callback(err, !!exists);
    });
  }

  function ignoredFilesKey(blogID) {
    return "blog:" + blogID + ":ignored_files";
  }

  return {
    add: add,
    drop: drop,
    get: get,
    getArray: getArray,
    getStatus: getStatus,
    isIt: isIt,
    flush: flush,
  };
})();
