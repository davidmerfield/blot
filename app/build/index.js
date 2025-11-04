var debug = require("debug")("blot:build");
var basename = require("path").basename;
var isDraft = require("../sync/update/drafts").isDraft;
var BuildSingle = require("./single");
var BuildMultiple = require("./multiple");
var Prepare = require("./prepare");
var Thumbnail = require("./thumbnail");
var DateStamp = require("./prepare/dateStamp");
var moment = require("moment");
var converters = require("./converters");
var pathNormalizer = require("helper/pathNormalizer");

// This file cannot become a blog post because it is not
// a type that Blot can process properly.
function isConvertible(path) {
  return converters.some(function (converter) {
    return converter.is(path);
  });
}

function isWrongType(path) {
  return !isConvertible(path);
}

function findMultiFolder(path) {
  var normalized = pathNormalizer(path);
  if (!normalized || normalized === "/") return null;

  var segments = normalized.split("/").filter(Boolean);
  var multiIndex = -1;

  for (var i = segments.length - 1; i >= 0; i--) {
    if (segments[i].slice(-1) === "+") {
      multiIndex = i;
      break;
    }
  }

  if (multiIndex === -1) return null;

  var folderSegments = segments.slice(0, multiIndex + 1);
  var entrySegments = folderSegments.map(stripTrailingPlus);

  var folderPath = "/" + folderSegments.join("/");
  var entryPath = "/" + entrySegments.join("/");

  if (!entryPath || entryPath === "//") entryPath = "/";

  return {
    folderPath: folderPath,
    entryPath: entryPath,
    triggerPath: normalized,
  };
}

function stripTrailingPlus(segment) {
  if (!segment) return segment;
  return segment.replace(/\+$/, "");
}

module.exports = function build(blog, path, callback) {
  debug("Build:", process.pid, "processing", path);

  var multiInfo = findMultiFolder(path);
  var entryPath = multiInfo ? multiInfo.entryPath : path;
  var builder = multiInfo ? BuildMultiple : BuildSingle;
  var buildArgument = multiInfo ? multiInfo : entryPath;

  if (!multiInfo && isWrongType(entryPath)) {
    var err = new Error("Path is wrong type to convert");
    err.code = "WRONGTYPE";
    return callback(err);
  }

  debug("Blog:", blog.id, entryPath, " checking if draft");
  isDraft(blog.id, entryPath, function (err, is_draft) {
    if (err) return callback(err);

    debug("Blog:", blog.id, entryPath, " attempting to build html");
    builder(blog, buildArgument, function (
      err,
      html,
      metadata,
      stat,
      dependencies,
      extras,
    ) {
      if (err) return callback(err);

      metadata = metadata || {};
      stat = stat || {};
      dependencies = dependencies || [];
      extras = extras || {};

      debug("Blog:", blog.id, entryPath, " extracting thumbnail");
      Thumbnail(blog, entryPath, metadata, html, function (err, thumbnail) {
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
            name: basename(entryPath),
            path: entryPath,
            id: entryPath,
            thumbnail: thumbnail,
            draft: is_draft,
            metadata: metadata,
            size: typeof stat.size === "number" ? stat.size : 0,
            dependencies: dependencies,
            exif: (extras && extras.exif) || {},
            dateStamp: DateStamp(blog, entryPath, metadata),
            updated: stat && stat.mtime ? moment.utc(stat.mtime).valueOf() : Date.now(),
          };

          if (entry.dateStamp === undefined) {
            entry.dateStampWasRemoved = true;
            delete entry.dateStamp;
          }

          debug(
            "Blog:",
            blog.id,
            entryPath,
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

module.exports.isConvertible = isConvertible;
module.exports.findMultiFolder = findMultiFolder;
