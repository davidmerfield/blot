var config = require("config");
var uuid = require("uuid/v4");
var join = require("path").join;
var fs = require("fs-extra");
var cache_folder_name = "_image_cache";
var fs = require("fs-extra");
var resize = require("./resize");
var extname = require("path").extname;
var uuid = require("uuid/v4");
var join = require("path").join;
var debug = require("debug")("blot:entry:build:plugins:image");

// Only cache images with the following file extensions
// We only resize and optimize JPG and PNG.
var EXTENSION_WHITELIST = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

module.exports = function (blogID) {
  return function (path, _callback) {
    // Extnames can sometimes be uppercase, we want to ensure that
    // this will work on case-sensitive file systems so we lowercase it...
    var extension = extname(path).toLowerCase();
    var name = uuid() + extension;
    var finalPath = join(
      config.blog_static_files_dir,
      blogID,
      cache_folder_name,
      name
    );

    var src =
      config.cdn.origin + "/" + blogID + "/" + cache_folder_name + "/" + name;

    // Wrap callback to clean up file if we encounter an error in this module
    // When transformer creates and cleans up a tmp file for us, can remove this.
    var callback = function (err, info) {
      if (!err) return _callback(null, info);

      fs.remove(finalPath, function () {
        _callback(err, info);
      });
    };

    if (EXTENSION_WHITELIST.indexOf(extension) === -1)
      return callback(
        new Error("Image does not have an extension we can cache.")
      );

    debug("Copying", path, "to", finalPath);
    fs.copy(path, finalPath, function (err) {
      if (err) return callback(err);

      debug("Resizing", finalPath);
      resize(finalPath, function (err, info) {
        if (err) return callback(err);

        if (!info.width || !info.height)
          return callback(new Error("No width or height"));

        debug("Minifying", finalPath);
        // minify(finalPath, function(err){

        if (err) return callback(err);

        info.src = src;

        callback(null, info);
        // });
      });
    });
  };
};
