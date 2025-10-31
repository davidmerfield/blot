var joinpath = require("path").join;
var async = require("async");
var callOnce = require("helper/callOnce");
var isOwner = require("./isOwner");
var getAllViews = require("./getAllViews");
var localPath = require("helper/localPath");
var fs = require("fs-extra");
var generatePackage = require("./package").generate;

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

          // Reset the folder before writing. This fixes a bug in which
          // there were two views with the same name, but different extension.
          client.remove(blogID, dir, function (err) {
            if (err) {
              return callback(err);
            }

            metadata.enabled = blogTemplate === templateID;

            writePackage(blogID, client, dir, metadata, views, function (err) {
              if (err) {
                return callback(err);
              }

              async.eachOfSeries(
                views,
                function (view, name, next) {
                  if (!view.name || !view.content) return next();

                  write(blogID, client, dir, view, next);
                },
                callback
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
  client.write(blogID, dir + "/package.json", Package, callback);
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

  client.write(blogID, path, content, callback);
}

function badPermission (blogID, templateID) {
  return new Error("No permission for " + blogID + " to write " + templateID);
}

function noTemplate (blogID, templateID) {
  return new Error("No template for " + blogID + " and " + templateID);
}

module.exports = writeToFolder;
