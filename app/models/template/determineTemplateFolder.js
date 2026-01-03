var localPath = require("helper/localPath");
var fs = require("fs-extra");

function determineTemplateFolder(blogID, callback) {
  var root = localPath(blogID, "/");

  fs.readdir(root, function (err, entries) {
    if (err || !Array.isArray(entries)) {
      return callback(null, "Templates");
    }

    if (entries.indexOf("Templates") > -1) return callback(null, "Templates");
    if (entries.indexOf("templates") > -1) return callback(null, "templates");

    var visible = entries.filter(function (name) {
      return name && name[0] !== ".";
    });

    if (visible.length && visible.every(function (name) {
      return name === name.toLowerCase();
    })) {
      return callback(null, "templates");
    }

    callback(null, "Templates");
  });
}

module.exports = determineTemplateFolder;
