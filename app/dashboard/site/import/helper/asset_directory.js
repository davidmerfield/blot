var fs = require("fs-extra");
var os = require("os");
var path = require("path");

// Assets are staged outside the output tree. This keeps their directories from
// influencing final path allocation before the entry itself is written.
module.exports = function assetDirectory(entry, callback) {
  if (entry.asset_directory) {
    return process.nextTick(function () {
      callback(null, entry.asset_directory);
    });
  }

  if (entry.asset_directory_callbacks) {
    entry.asset_directory_callbacks.push(callback);
    return;
  }

  entry.asset_directory_callbacks = [callback];

  fs.mkdtemp(path.join(os.tmpdir(), "blot-import-"), function (err, directory) {
    var callbacks = entry.asset_directory_callbacks;

    delete entry.asset_directory_callbacks;

    if (!err) entry.asset_directory = directory;

    callbacks.forEach(function (callback) {
      callback(err, directory);
    });
  });
};
