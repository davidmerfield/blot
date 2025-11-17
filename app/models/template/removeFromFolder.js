var joinpath = require("path").join;
var isOwner = require("./isOwner");
var localPath = require("helper/localPath");
var fs = require("fs-extra");
var getAllViews = require("./getAllViews");

function removeFromFolder (blogID, templateID, callback) {
  isOwner(blogID, templateID, function (err, owner) {
    if (err) return callback(err);

    if (!owner) return callback(null);

    getAllViews(templateID, function (err, views, metadata) {
        if (err) return callback(err);
  
        if (!views || !metadata || !metadata.localEditing) return callback(null);
  
      makeClient(blogID, function (err, client) {
        if (err) {
          return callback(err);
        }

        determineTemplateFolder(blogID, function (folderErr, folderName) {
          if (folderErr) {
            return callback(folderErr);
          }

          var dir = joinpath(folderName, metadata.slug);
          
          client.remove(blogID, dir, callback);
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

module.exports = removeFromFolder;
