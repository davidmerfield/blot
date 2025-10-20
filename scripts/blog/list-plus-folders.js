var path = require("path");
var fs = require("fs-extra");
var async = require("async");
var Blog = require("models/blog");
var User = require("models/user");
var config = require("../../config");

var BLOGS_DIRECTORY = config.blog_folder_dir;

if (require.main === module) {
  main(function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    process.exit();
  });
}

function main(callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);

    async.mapSeries(
      ids,
      function (id, next) {
        var blogFolder = path.join(BLOGS_DIRECTORY, id);

        fs.pathExists(blogFolder, function (err, exists) {
          if (err) return next(err);
          if (!exists) return next();

          var plusFolders;

          try {
            plusFolders = findPlusFolders(blogFolder);
          } catch (err) {
            if (err.code === "ENOENT" || err.code === "ENOTDIR") return next();
            return next(err);
          }

          if (!plusFolders.length) return next();

          Blog.get({ id: id }, function (err, blog) {
            if (err) return next(err);
            if (!blog) return next();

            Blog.extend(blog);

            User.getById(blog.owner, function (err, user) {
              if (err) return next(err);

              next(null, {
                id: id,
                url: blog.url,
                email: (user && user.email) || null,
                folders: plusFolders,
              });
            });
          });
        });
      },
      function (err, results) {
        if (err) return callback(err);

        results = results.filter(Boolean);

        if (!results.length) {
          console.log("No blogs with '+' folders were found.");
          return callback();
        }

        console.log("Found " + results.length + " blog(s) with '+' folders:\n");

        results.forEach(function (result) {
          console.log("Blog ID: " + result.id);
          console.log("URL: " + (result.url || "(unknown)"));
          console.log("Owner email: " + (result.email || "(unknown)"));
          console.log("Folders:");
          result.folders.forEach(function (folder) {
            console.log("  - " + folder);
          });
          console.log("");
        });

        callback();
      }
    );
  });
}

function findPlusFolders(root) {
  var results = [];

  function walk(relative) {
    var currentPath = relative ? path.join(root, relative) : root;
    var entries;

    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return;
      throw err;
    }

    entries.forEach(function (entry) {
      if (!entry.isDirectory()) return;

      var childRelative = relative
        ? path.join(relative, entry.name)
        : entry.name;

      if (entry.name.slice(-1) === "+") {
        results.push("/" + childRelative.split(path.sep).join("/"));
      }

      walk(childRelative);
    });
  }

  walk("");

  return results;
}

module.exports = main;
