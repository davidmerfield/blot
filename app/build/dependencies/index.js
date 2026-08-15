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
//
// This includes <a href> as well as <img src> and friends: a
// relative link to a local file is resolved against the file's
// location in the user's folder, not the URL of the post it
// appears on – those are frequently different (e.g. the default
// permalink format is just {{slug}}, unrelated to folder layout).
// This is a deliberate breaking change: previously a relative
// <a href> to a local file was left untouched by the build
// pipeline and resolved (incorrectly, in most cases) against the
// post's published URL by the browser instead.
//
// A relative <a href> is resolved exactly like a relative
// src – no extension filtering, no check that the file exists.
// A link to another post's source file (e.g. other-post.md, or
// page.html) resolves directly to that file, the same as it
// would for an <img src>; it is not resolved against that post's
// permalink. We skip anything already tagged as a wikilink
// (title="wikilink"), since the markdown converter emits those
// directly from [[...]] syntax and the wikilinks plugin – which
// runs after this module – is responsible for resolving them
// from their original, unresolved target text.

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
  // including images, videos, scripts and, now,
  // links to any local file.
  $("link[href], a[href], [src]").each(function () {
    var $el = $(this);
    var isAnchor = $el.is("a");
    var suffix = "";

    // Wikilinks ([[Note]] / ![[Image]]) are rendered directly to
    // <a title="wikilink"> / <img title="wikilink"> by the markdown
    // converter. The wikilinks plugin (which runs after this module)
    // resolves them from their original target text, so we must not
    // touch their href/src here.
    if ($el.attr("title") === "wikilink") {
      debug(path, "skipping wikilink-marked element");
      return;
    }

    if (!!$el.attr("href")) attribute = "href";
    if (!!$el.attr("src")) attribute = "src";

    value = $el.attr(attribute);

    if (!value) {
      debug(path, attribute, value, "is empty");
      return;
    }

    if (isAnchor) {
      // Anchors are also used for in-page navigation (footnotes,
      // tables of contents), which isn't a file path – strip any
      // #fragment or ?query before resolving and reattach it after.
      var cutIndex = -1;
      var hashIndex = value.indexOf("#");
      var queryIndex = value.indexOf("?");

      if (hashIndex > -1) cutIndex = hashIndex;
      if (queryIndex > -1 && (cutIndex === -1 || queryIndex < cutIndex))
        cutIndex = queryIndex;

      var pathPart = cutIndex === -1 ? value : value.slice(0, cutIndex);

      suffix = cutIndex === -1 ? "" : value.slice(cutIndex);

      if (!pathPart) {
        debug(path, attribute, value, "is a fragment or query only");
        return;
      }

      value = pathPart;
    }

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

    $el.attr(attribute, resolved_value + suffix);

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
