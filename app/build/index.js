var debug = require("debug")("blot:build");
var basename = require("path").basename;
var isDraft = require("../sync/update/drafts").isDraft;
var Build = require("./single");
var Prepare = require("./prepare");
var Thumbnail = require("./thumbnail");
var DateStamp = require("./prepare/dateStamp");
var moment = require("moment");
var enabledConverters = require("./converters/enabled");

// This file cannot become a blog post because it is not
// a type that Blot can process properly.
function isWrongType(blog, path) {
  var isWrong = true;

  enabledConverters(blog).forEach(function (converter) {
    if (converter.is(path)) isWrong = false;
  });

  return isWrong;
}

module.exports = function build(blog, path, callback) {
  debug("Build:", process.pid, "processing", path);

  if (isWrongType(blog, path)) {
    var err = new Error("Path is wrong type to convert");
    err.code = "WRONGTYPE";
    return callback(err);
  }

  debug("Blog:", blog.id, path, " checking if draft");
  isDraft(blog.id, path, function (err, is_draft) {
    if (err) return callback(err);

    debug("Blog:", blog.id, path, " attempting to build html");
    Build(blog, path, function (
      err,
      html,
      metadata,
      stat,
      dependencies,
      extras,
    ) {
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
            name: basename(path),
            path: path,
            id: path,
            thumbnail: thumbnail,
            draft: is_draft,
            metadata: metadata,
            size: stat.size,
            dependencies: dependencies,
            exif: (extras && extras.exif) || {},
            dateStamp: DateStamp(blog, path, metadata),
            updated: moment.utc(stat.mtime).valueOf(),
          };

          if (entry.dateStamp === undefined) {
            entry.dateStampWasRemoved = true;
            delete entry.dateStamp;
          }

          debug(
            "Blog:",
            blog.id,
            path,
            " preparing additional properties for",
            entry.name
          );
          entry = Prepare(entry, {
            titlecase: blog.plugins.titlecase.enabled,
          });
          debug("Blog:", blog.id, path, " additional properties computed.");
        } catch (e) {
          return callback(e);
        }

        callback(null, entry);
      });
    });
  });
};
