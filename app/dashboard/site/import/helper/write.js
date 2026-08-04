var fs = require("fs-extra");
var path = require("path");

var MAX_NAME_LENGTH = 150;

function createWriter() {
  var reserved = new Set();

  return function write(post, callback) {
    var basePath = allocate(post, reserved);
    var hasAssets = Boolean(
      post.asset_directory && fs.existsSync(post.asset_directory)
    );
    var finalPath = hasAssets ? path.join(basePath, "post.txt") : basePath + ".txt";

    post.path = basePath;
    post.content = post.content.trim();

    moveAssets(post.asset_directory, basePath, function (err) {
      if (err) return callback(err);

      fs.outputFile(finalPath, post.content, function (err) {
        if (err) return callback(err);

        var atime = Date.now();
        var mtime = post.updated || post.created || post.dateStamp || Date.now();
        fs.utimes(finalPath, atime, mtime, function (err) {
          if (err) return callback(err);
          callback(null);
        });
      });
    });
  };
}

function allocate(post, reserved) {
  var originalPath = post.path;
  var originalName = path.basename(originalPath);
  var directory = path.dirname(originalPath);
  var hasAssets = Boolean(
    post.asset_directory && fs.existsSync(post.asset_directory)
  );
  var number = 1;

  while (true) {
    var suffix = number === 1 ? "" : "-" + number;
    var name = originalName.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
    var candidate = path.join(directory, name);
    var finalPath = hasAssets ? path.join(candidate, "post.txt") : candidate + ".txt";
    var key = path.normalize(finalPath);

    if (!reserved.has(key) && !fs.existsSync(finalPath)) {
      reserved.add(key);
      return candidate;
    }

    number += 1;
  }
}

function moveAssets(source, destination, callback) {
  if (!source || !fs.existsSync(source)) return callback();

  fs.ensureDir(destination, function (err) {
    if (err) return callback(err);
    fs.readdir(source, function (err, names) {
      if (err) return callback(err);
      var remaining = names.length;
      if (!remaining) return fs.remove(source, callback);
      var failed;
      names.forEach(function (name) {
        fs.move(path.join(source, name), path.join(destination, name), function (moveErr) {
          if (failed) return;
          if (moveErr) {
            failed = true;
            return callback(moveErr);
          }
          if (!--remaining) fs.remove(source, callback);
        });
      });
    });
  });
}

// Retain the single-entry middleware API for callers outside the batch import.
var write = createWriter();
module.exports = write;
module.exports.createWriter = createWriter;
