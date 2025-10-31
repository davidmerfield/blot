var joinpath = require("path").join;
var sep = require("path").sep;
var async = require("async");
var callOnce = require("helper/callOnce");
var isOwner = require("./isOwner");
var getAllViews = require("./getAllViews");
var localPath = require("helper/localPath");
var fs = require("fs-extra");
var generatePackage = require("./package").generate;
var PACKAGE = "package.json";

function writeToFolder (blogID, templateID, callback) {
  isOwner(blogID, templateID, function (err, owner) {
    if (err) return callback(err);

    if (!owner) return callback(badPermission(blogID, templateID));

    getAllViews(templateID, function (err, views, metadata) {
      if (err) return callback(err);

      if (!views || !metadata) return callback(noTemplate(blogID, templateID));

      makeClient(blogID, function (err, client, blogTemplate) {
        if (err) {
          return callback(err);
        }

        determineTemplateFolder(blogID, function (folderErr, folderName) {
          if (folderErr) {
            return callback(folderErr);
          }

          var dir = joinpath(folderName, metadata.slug);

          listExistingFiles(blogID, client, dir, function (err, existingFiles) {
            if (err) {
              return callback(err);
            }

            existingFiles = existingFiles.map(normalizePath);

            metadata.enabled = blogTemplate === templateID;

            var written = new Set();

            writePackage(blogID, client, dir, metadata, views, function (err) {
              if (err) {
                return callback(err);
              }

              written.add(normalizePath(PACKAGE));

              async.eachOfSeries(
                views,
                function (view, name, next) {
                  if (!view || !view.name || !view.content) return next();

                  write(blogID, client, dir, view, function (err) {
                    if (!err) written.add(normalizePath(view.name));
                    next(err);
                  });
                },
                function (err) {
                  if (err) return callback(err);

                  removeOrphanedFiles(
                    blogID,
                    client,
                    dir,
                    existingFiles,
                    written,
                    callback
                  );
                }
              );
            });
          });
        });
      });
    });
  });
}

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

function writePackage (blogID, client, dir, metadata, views, callback) {
  var Package = generatePackage(blogID, metadata, views);
  writeFileIfChanged(blogID, client, joinpath(dir, PACKAGE), Package, callback);
}

function makeClient (blogID, callback) {
  require("models/blog").get({ id: blogID }, function (err, blog) {
    var client = require("clients")[blog.client];

    // we create a fake client to write the template files directly
    // to the blog's folder if the user has not configured a client
    if (!blog.client || !client) {
      return callback(null, {
        remove: function (blogID, path, callback) {
          fs.remove(localPath(blogID, path), callback);
        },
        write: function (blogID, path, content, callback) {
          fs.outputFile(localPath(blogID, path), content, callback);
        },
        list: function (blogID, path, callback) {
          listLocalFiles(blogID, path, callback);
        }
      });
    }

    return callback(null, client, blog.template);
  });
}

function write (blogID, client, dir, view, callback) {
  callback = callOnce(callback);

  var path = joinpath(dir, view.name);
  var content = view.content;

  writeFileIfChanged(blogID, client, path, content, callback);
}

function writeFileIfChanged(blogID, client, path, content, callback) {
  var absolute = localPath(blogID, path);

  fs.readFile(absolute, "utf-8", function (err, existing) {
    if (!err && existing === content) return callback();
    client.write(blogID, path, content, callback);
  });
}

function listExistingFiles(blogID, client, dir, callback) {
  if (client && typeof client.list === "function") {
    return client.list(blogID, dir, function (err, files) {
      if (err) return callback(err);

      if (!Array.isArray(files)) files = [];

      callback(null, files.map(normalizePath));
    });
  }

  listLocalFiles(blogID, dir, callback);
}

function listLocalFiles(blogID, dir, callback) {
  var root = localPath(blogID, dir);

  fs.readdir(root, function (err, entries) {
    if (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return callback(null, []);
      return callback(err);
    }

    var files = [];

    async.each(
      entries,
      function (entry, next) {
        walk(joinpath(root, entry), entry, next);
      },
      function (err) {
        if (err) return callback(err);
        callback(null, files.map(normalizePath));
      }
    );

    function walk(fullPath, relativePath, next) {
      fs.stat(fullPath, function (err, stat) {
        if (err) {
          if (err.code === "ENOENT") return next();
          return next(err);
        }

        if (stat.isDirectory()) {
          fs.readdir(fullPath, function (err, children) {
            if (err) {
              if (err.code === "ENOENT") return next();
              return next(err);
            }

            async.each(
              children,
              function (child, childNext) {
                walk(joinpath(fullPath, child), joinpath(relativePath, child), childNext);
              },
              next
            );
          });
        } else {
          files.push(relativePath);
          next();
        }
      });
    }
  });
}

function removeOrphanedFiles(blogID, client, dir, existingFiles, written, callback) {
  var toRemove = existingFiles.filter(function (file) {
    return !written.has(normalizePath(file));
  });

  async.eachSeries(
    toRemove,
    function (file, next) {
      client.remove(blogID, joinpath(dir, file), next);
    },
    callback
  );
}

function normalizePath(path) {
  return typeof path === "string" ? path.split(sep).join("/") : path;
}

function badPermission (blogID, templateID) {
  return new Error("No permission for " + blogID + " to write " + templateID);
}

function noTemplate (blogID, templateID) {
  return new Error("No template for " + blogID + " and " + templateID);
}

module.exports = writeToFolder;
