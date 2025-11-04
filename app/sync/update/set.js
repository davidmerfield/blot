var rebuildDependents = require("./rebuildDependents");
var Ignore = require("./ignore");
var Entry = require("models/entry");
var Preview = require("./preview");
var isPreview = require("./drafts").isPreview;
var async = require("async");
var WRONG_TYPE = "WRONG_TYPE";
var PUBLIC_FILE = "PUBLIC_FILE";
var isHidden = require("build/prepare/isHidden");
var build = require("build");
var pathNormalizer = require("helper/pathNormalizer");
var makeSlug = require("helper/makeSlug");
var path = require("path");

var basename = (path.posix || path).basename;
var noop = () => {};

function isPublic(path) {
  const normalizedPath = pathNormalizer(path).toLowerCase();
  return (
    // blot specific rule not to turn files inside
    // a folder called public into blog posts
    normalizedPath.startsWith("/public/") ||
    // blot specific rule to ignore files and folders
    // whose name begins with an underscore
    normalizedPath.includes("/_") ||
    // convention to ingore dotfiles or folders
    normalizedPath.includes("/.")
  );
}

function isTemplate(path) {
  return pathNormalizer(path).toLowerCase().startsWith("/templates/");
}

function dropEntryAndPreview(blogID, targetPath, callback) {
  targetPath = pathNormalizer(targetPath);

  Entry.get(blogID, targetPath, function (entry) {
    if (!entry) return callback();

    Entry.drop(blogID, targetPath, function (err) {
      if (err) return callback(err);

      if (entry.draft && !isHidden(targetPath)) {
        Preview.remove(blogID, targetPath, callback);
      }

      // This file is a draft, write a preview file
      // to the users Dropbox and continue down
      // We look up the remote path later in this module...
      if (entry.draft && !isHidden(entry.path)) {
        Preview.write(blog.id, path, callback);
      } else {
        callback();
      }
    });
  });
}

function buildAndSet(blog, path, multiInfo, callback) {
  build(blog, path, function (err, entry) {
    if (err && err.code === "WRONGTYPE")
      return Ignore(blog.id, path, WRONG_TYPE, callback);

    if (err && err.code === "EMPTY" && multiInfo)
      return dropEntryAndPreview(blog.id, multiInfo.entryPath, callback);

    if (err && err.code === "TOO_MANY_FILES" && multiInfo)
      return dropEntryAndPreview(blog.id, multiInfo.entryPath, callback);

    if (err) return callback(err);

    var sourcePaths = [];

    if (entry.metadata && Array.isArray(entry.metadata._sourcePaths)) {
      sourcePaths = entry.metadata._sourcePaths
        .map(pathNormalizer)
        .filter(Boolean);
    }

    var dropTargets = sourcePaths
      .filter(function (sourcePath) {
        return sourcePath !== entry.path;
      })
      .filter(function (value, index, array) {
        return array.indexOf(value) === index;
      });

    async.series(
      [
        function (next) {
          async.eachSeries(
            dropTargets,
            function (target, done) {
              dropEntryAndPreview(blog.id, target, done);
            },
            next
          );
        },
        function (next) {
          if (entry.metadata && entry.metadata._sourcePaths)
            delete entry.metadata._sourcePaths;

          Entry.set(blog.id, entry.path, entry, function (err) {
            if (err) return next(err);

            const syntheticKeys = new Set();

            const slugToken = makeSlug(
              entry.slug || entry.metadata.title || entry.title || ""
            );
            if (slugToken) {
              syntheticKeys.add(`/__wikilink_slug__/${slugToken}`);
            }

            const filenameToken = entry.path ? basename(entry.path) : "";
            if (filenameToken) {
              syntheticKeys.add(`/__wikilink_filename__/${filenameToken}`);
            }

            syntheticKeys.forEach((syntheticKey) =>
              rebuildDependents(blog.id, syntheticKey, noop)
            );

            if (entry.draft && !isHidden(entry.path)) {
              Preview.write(blog.id, entry.path, next);
            } else {
              next();
            }
          });
        },
      ],
      callback
    );
  });
}

module.exports = function (blog, path, callback) {
  // if typoeof callback is not function, throw error
  if (typeof callback !== "function") {
    throw new Error("sync.set: callback must be a function");
  }

  // if typeof blog is not object, return error
  if (typeof blog !== "object") {
    return callback(new Error("sync.set: blog must be an object"));
  }

  // if typeof path is not string, return error
  if (typeof path !== "string") {
    return callback(new Error("sync.set: path must be a string"));
  }

  path = pathNormalizer(path);

  var queue = {};
  var multiInfo = build.findMultiFolder(path);

  isPreview(blog.id, path, function (err, is_preview) {
    if (err) return callback(err);

    // The file is public. Its name begins
    // with an underscore, or it's inside a folder
    // whose name begins with an underscore. It should
    // therefore not be a blog post.
    if (isPublic(path)) {
      queue.ignore = Ignore.bind(this, blog.id, path, PUBLIC_FILE);
    }

    // This file should become a blog post or page!
    if (!isPublic(path) && !isTemplate(path) && !is_preview) {
      queue.buildAndSet = buildAndSet.bind(this, blog, path, multiInfo);
    }

    async.parallel(queue, function (err) {
      if (err) return callback(err);

      var targets = [path];

      if (multiInfo && multiInfo.entryPath)
        targets.push(pathNormalizer(multiInfo.entryPath));

      targets = targets
        .map(pathNormalizer)
        .filter(function (value, index, array) {
          return array.indexOf(value) === index;
        });

      async.eachSeries(
        targets,
        function (target, next) {
          rebuildDependents(blog.id, target, next);
        },
        callback
      );
    });
  });
};
