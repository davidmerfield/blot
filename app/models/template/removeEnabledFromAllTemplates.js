var async = require("async");
var joinpath = require("path").join;
var fs = require("fs-extra");
var localPath = require("helper/localPath");
var determineTemplateFolder = require("./determineTemplateFolder");
var shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

var PACKAGE = "package.json";

function removeEnabledFromAllTemplates(blogID, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  if (options.folderName) {
    return removeEnabledFromAllTemplatesInFolder(
      blogID,
      options.folderName,
      callback
    );
  }

  determineTemplateFolder(blogID, function (err, folderName) {
    if (err) return callback(err);
    removeEnabledFromAllTemplatesInFolder(blogID, folderName, callback);
  });
}

function removeEnabledFromAllTemplatesInFolder(blogID, folderName, callback) {
  var root = localPath(blogID, folderName);

  fs.readdir(root, function (err, entries) {
    if (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return callback(null, []);
      return callback(err);
    }

    var errors = [];
    var modifiedSlugs = [];

    async.eachSeries(
      entries,
      function (entry, next) {
        if (!entry || entry[0] === "." || shouldIgnoreFile(entry)) {
          return next();
        }

        var entryPath = joinpath(root, entry);

        fs.lstat(entryPath, function (err, stat) {
          if (err) {
            if (err.code === "ENOENT") return next();
            errors.push(err);
            return next();
          }

          if (stat.isSymbolicLink() || !stat.isDirectory()) return next();

          var packagePath = joinpath(folderName, entry, PACKAGE);
          var packageAbsolute = localPath(blogID, packagePath);

          fs.readFile(packageAbsolute, "utf-8", function (err, contents) {
            if (err) {
              if (err.code === "ENOENT") return next();
              errors.push(err);
              return next();
            }

            var data;

            try {
              data = JSON.parse(contents);
            } catch (parseErr) {
              errors.push(parseErr);
              return next();
            }

            if (!data || data.enabled !== true) return next();

            data.enabled = false;
            var updated = JSON.stringify(data, null, 2);

            fs.outputFile(packageAbsolute, updated, function (err) {
              if (err) {
                errors.push(err);
              } else {
                modifiedSlugs.push(entry);
              }
              next();
            });
          });
        });
      },
      function (err) {
        if (err) errors.push(err);
        if (errors.length) {
          var aggregate = new Error(
            "Failed to update one or more template packages."
          );
          aggregate.errors = errors;
          return callback(aggregate, modifiedSlugs);
        }

        callback(null, modifiedSlugs);
      }
    );
  });
}

module.exports = removeEnabledFromAllTemplates;

