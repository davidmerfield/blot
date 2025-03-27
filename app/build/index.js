var debug = require("debug")("blot:build");
var Metadata = require("models/metadata");
var basename = require("path").basename;
var isDraft = require("../sync/update/drafts").isDraft;
var Build = require("./single");
var Prepare = require("./prepare");
var Thumbnail = require("./thumbnail");
var DateStamp = require("./prepare/dateStamp");
var moment = require("moment");
var converters = require("./converters");
var clfdate = require("helper/clfdate");

// This file cannot become a blog post because it is not
// a type that Blot can process properly.
function isWrongType (path) {
  var isWrong = true;

  converters.forEach(function (converter) {
    if (converter.is(path)) isWrong = false;
  });

  return isWrong;
}

module.exports = function build (blog, path, options, callback) {
  debug("Build:", process.pid, "processing", path);

  if (isWrongType(path)) {
    var err = new Error("Path is wrong type to convert");
    err.code = "WRONGTYPE";
    return callback(err);
  }

  Metadata.getPath(blog.id, path, function (err, storedPathDisplay) {
    if (err) return callback(err);

    const storedName = basename(storedPathDisplay);

    debug("Blog:", blog.id, path, " checking if draft");
    isDraft(blog.id, path, function (err, is_draft) {
      if (err) return callback(err);

      debug("Blog:", blog.id, path, " attempting to build html");
      Build(
        blog,
        path,
        options,
        function (err, html, metadata, stat, dependencies) {
          if (err) return callback(err);

          debug("Blog:", blog.id, path, " extracting thumbnail");
          Thumbnail(blog, path, metadata, html, function (err, thumbnail) {
            // Could be lots of reasons (404?)
            if (err || !thumbnail) thumbnail = {};

            var entry;

            // Given the properties above
            // that we've extracted from the
            // local file, compute stuff like
            // the teaser, isDraft etc..

            try {
              entry = {
                html: html,
                name: options.name || storedName || basename(path),
                path: path,
                pathDisplay: options.pathDisplay || storedPathDisplay || path,
                id: path,
                thumbnail: thumbnail,
                draft: is_draft,
                metadata: metadata,
                size: stat.size,
                dependencies: dependencies,
                dateStamp: DateStamp(blog, path, metadata),
                updated: moment.utc(stat.mtime).valueOf()
              };

              if (entry.dateStamp === undefined) delete entry.dateStamp;

              debug(
                "Blog:",
                blog.id,
                path,
                " preparing additional properties for",
                entry.name
              );
              entry = Prepare(entry, {
                ...options,
                titlecase: blog.plugins.titlecase.enabled
              });
              debug("Blog:", blog.id, path, " additional properties computed.");
            } catch (e) {
              return callback(e);
            }

            callback(null, entry);
          });
        }
      );
    });
  });
}