var debug = require("debug")("blot:entry:build:plugins:images");
var sharp = require("sharp");
var ensure = require("helper/ensure");
var tempDir = require("helper/tempDir")();
var fs = require("fs-extra");
var uuid = require("uuid/v4");
var extname = require("path").extname;
var pngMetadata = require("helper/pngMetadata");

// We don't do .gif because sharp cannot handle animated
// gifs at the moment. Perhaps in future...
var RESIZE_EXTENSION_WHITELIST = [".jpg", ".jpeg", ".png"];

// Sharp seems to cache files based on their
// path and not the contents of the file at
// a particular path. It was returning stale
// versions of a file in the blog's folder.
// Perhaps it might be smarter to copy the file
// to the temporary directory before operating on it?
// It's also possible that this is a bug in Sharp's
// caching that has been fixed in a more recent version
// or that still needs to be fixed. I should investigate.
sharp.cache(false);

module.exports = function (path, callback) {
  ensure(path, "string").and(callback, "function");

  var extension = extname(path).toLowerCase();
  var output = tempDir + uuid();

  (async function () {
    var gamma = null;

    if (extension === ".png") {
      gamma = await pngMetadata.readGamma(path);
    }

    // Since this image is not one we can resize, we fetch
    // its dimensions and continue...
    if (RESIZE_EXTENSION_WHITELIST.indexOf(extension) === -1) {
      debug("Fetching metadata for", path);
      return sharp(path).metadata(callback);
    }

    var image;

    try {
      debug("Resizing", path);
      image = sharp(path)
        .keepIccProfile()
        .rotate()
        .resize(3000, 3000, { withoutEnlargement: true, fit: "inside" });
    } catch (e) {
      throw e;
    }

    var info;

    try {
      info = await image.toFile(output);
    } catch (err) {
      throw err;
    }

    if (!info) throw new Error("No info");

    await fs.remove(path);
    await fs.move(output, path);

    if (gamma !== null) {
      await pngMetadata.ensureGamma(path, gamma);
    }

    callback(null, info);
  })().catch(callback);
};
