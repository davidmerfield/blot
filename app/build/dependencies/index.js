var resolve = require("./resolve");
var cheerio = require("cheerio");
var is_url = require("./is_url");
var debug = require("debug")("blot:build:dependencies");
var is_path = require("./is_path");
var metadataCaseInsensitive = require("helper/metadataCaseInsensitive");

// The purpose of this module is to take the HTML for
// a given blog post and work out if it references any
// files in the user's folder. For example, this image
// does: <img src="apple.png"> but this video doesn't:
// <video><source src="//example.com/movie.mp4"></video>
// Our goal is to first resolve all relative file paths
// then determine the list of dependencies. This modifies
// the HTML passed to it.

function dependencies (path, html, metadata) {
  // In future it would be nice NOT to reparse the HTML
  // Multiple times. The plugins features also do this.
  var $ = cheerio.load(html, { decodeEntities: false }, false);
  var dependencies = [];
  var attribute, value, resolved_value;
  var metadataByLowercaseKey = metadataCaseInsensitive(metadata);

  // We have to be slightly stricter for
  Object.keys(metadata).forEach(function (attribute) {
    value = metadata[attribute];
    resolved_value = resolve(path, value);

    if (is_url(value)) {
      debug(path, attribute, value, "is a URL");
      return;
    }

    if (!is_path(value)) {
      debug(path, attribute, value, "is not a path");
      return;
    }

    if (dependencies.indexOf(resolved_value) !== -1) {
      debug(path, attribute, resolved_value, "is already on the list");
      return;
    }

    if (dependencies.indexOf(value) !== -1) {
      debug(path, attribute, value, "is already on the list");
      return;
    }

    // Try and resolve the thumbnail path
    // Likewise if it's e.g. ./image.png
    var isThumbnail =
      attribute.toLowerCase() === "thumbnail" &&
      value === metadataByLowercaseKey.thumbnail;

    if (isThumbnail || value.indexOf("./") === 0) {
      dependencies.push(resolved_value);
      metadata[attribute] = resolved_value;
      debug(path, attribute, resolved_value, "was added to dependencies");

      // If the metadata value starts with a slash
      // it's probably a dependency, e.g. /image.png
    } else if (value[0] === "/") {
      dependencies.push(value);
      debug(path, attribute, value, "was added to dependencies");
    }
  });

  // This matches CSS files in the blog post
  // This matches just about everything else,
  // including images, videos, scripts.
  $("link[href], [src]").each(function () {
    if (!!$(this).attr("href")) attribute = "href";
    if (!!$(this).attr("src")) attribute = "src";

    value = $(this).attr(attribute);

    if (is_url(value)) {
      debug(path, attribute, value, "is a URL");
      return;
    }

    if (!is_path(value)) {
      debug(path, attribute, value, "is not a path");
      return;
    }

    resolved_value = resolve(path, value);

    if (resolved_value === path) {
      debug(path, attribute, value, "is the same as its path");
      return;
    }

    $(this).attr(attribute, resolved_value);

    if (dependencies.indexOf(resolved_value) === -1) {
      dependencies.push(resolved_value);
      debug(path, attribute, resolved_value, "was added to dependencies");
    } else {
      debug(path, attribute, resolved_value, "is already on list");
    }
  });

  return { html: $.html(), dependencies: dependencies, metadata: metadata };
}

module.exports = dependencies;
