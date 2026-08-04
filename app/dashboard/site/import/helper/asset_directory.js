var fs = require("fs-extra");
var os = require("os");
var path = require("path");

// Assets are staged outside the output tree. This keeps their directories from
// influencing final path allocation before the entry itself is written.
module.exports = function assetDirectory(entry) {
  if (!entry.asset_directory) {
    entry.asset_directory = fs.mkdtempSync(path.join(os.tmpdir(), "blot-import-"));
  }

  return entry.asset_directory;
};
