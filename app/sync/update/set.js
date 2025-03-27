var rebuildDependents = require("./rebuildDependents");
var Ignore = require("./ignore");
var Metadata = require("models/metadata");
var Entry = require("models/entry");
var Preview = require("./preview");
var isPreview = require("./drafts").isPreview;
var async = require("async");
var WRONG_TYPE = "WRONG_TYPE";
var PUBLIC_FILE = "PUBLIC_FILE";
var isHidden = require("build/prepare/isHidden");
var build = require("build");
var pathNormalizer = require("helper/pathNormalizer");

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

function buildAndSet(blog, path, options, callback) {
  build(blog, path, options, function (err, entry) {
    if (err && err.code === "WRONGTYPE")
      return Ignore(blog.id, path, WRONG_TYPE, callback);

    if (err) return callback(err);

    Entry.set(blog.id, entry.path, entry, function (err) {
      if (err) return callback(err);
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

module.exports = function (blog, path, options, callback) {
  if (callback === undefined && typeof options === "function") {
    callback = options;
    options = {};
  }

  path = pathNormalizer(path);

  var queue = {};

  isPreview(blog.id, path, function (err, is_preview) {
    if (err) return callback(err);

    // Store the case-preserved name against the
    // path to this file
    if (options.name) {
      queue.metadata = Metadata.add.bind(this, blog.id, path, options.name);
    }

    // The file is public. Its name begins
    // with an underscore, or it's inside a folder
    // whose name begins with an underscore. It should
    // therefore not be a blog post.
    if (isPublic(path)) {
      queue.ignore = Ignore.bind(this, blog.id, path, PUBLIC_FILE);
    }

    // This file should become a blog post or page!
    if (!isPublic(path) && !isTemplate(path) && !is_preview) {
      queue.buildAndSet = buildAndSet.bind(this, blog, path, options);
    }

    async.parallel(queue, function (err) {
      if (err) return callback(err);
      rebuildDependents(blog.id, path, callback);
    });
  });
};
