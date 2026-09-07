var cheerio = require("cheerio");
var basename = require("path").basename;
var extname = require("path").extname;
var join = require("path").join;
var parse = require("url").parse;
var each_el = require("./each_el");
var fs = require("fs-extra");
var sharp = require("sharp");
var mime = require("mime-types");
var assetDirectory = require("./asset_directory");
var download = require("helper/transformer/download");

// Consider using this algorithm to determine best part of alt tag or caption to use
// as the file's name:
// http://www.bearcave.com/misl/misl_tech/wavelets/compression/shannon.html

// Remote assets are fetched through helper/transformer's download module
// rather than a bare fetch(). That module routes every request - and every
// redirect - through the airlock forward proxy (see config/airlock), whose
// nftables egress filter blocks a URL that resolves to a private range, a
// cloud metadata endpoint or a DNS-rebinding target. An import pulls
// arbitrary URLs out of a user-supplied WordPress / Blogger / Are.na export,
// so this matters.
//
// It deliberately does NOT use the full Transformer (the Redis-backed,
// content-hash-keyed result cache): that cache is process-global, and
// Transformer.fromURL serves the last good result when a later download
// fails - so an expired signed URL that now 403s for a different account
// would hand back the first account's bytes. Every import re-downloads, the
// same as before this change.

// Fetch a remote src to a temp file: { tempPath, name }. Calls back with no
// result (rather than an error) for anything we should skip - data: URIs,
// unparseable hosts, download failures, an access-denied response - matching
// the old behaviour of leaving the original src untouched.
function fetchAsset(src, callback) {
  if (!src || src.indexOf("data:") === 0) return callback();

  try {
    if (!parse(src).hostname) return callback();
  } catch (e) {
    return callback();
  }

  // Empty headers: no If-None-Match / If-Modified-Since, so no 304 - the
  // download always produces a temp file on success.
  download(src, {}, function (err, tempPath) {
    if (err || !tempPath) {
      if (err) console.log("Failed to download image", src, err.message);
      return callback();
    }

    sharp(tempPath).metadata(function (err, metadata) {
      // Response headers are not surfaced here, so the filename is derived
      // from the URL plus sharp's detected format only (a host that serves
      // opaque image URLs, e.g. Blogger, therefore loses its
      // Content-Disposition filename - an accepted, cosmetic trade).
      var format = metadata && metadata.format ? metadata.format : undefined;
      callback(null, { tempPath: tempPath, name: nameFrom(src, null, format) });
    });
  });
}

// Move a fetched asset into the entry's staging directory and rewrite the
// element. The temp file is always consumed - moved on success, removed on
// any bail.
function place(post, el, $, src, asset, next) {
  assetDirectory(post, function (err, directory) {
    if (err) {
      fs.remove(asset.tempPath);
      return next(false);
    }

    fs.move(
      asset.tempPath,
      join(directory, asset.name),
      { overwrite: true },
      function (err) {
        if (err) {
          console.log("Failed to store image", src, err.message);
          fs.remove(asset.tempPath);
          return next(false);
        }

        if (el) {
          $(el).attr("src", asset.name);
          if ($(el).parent().attr("href") === src)
            $(el).parent().attr("href", asset.name);
        }

        next(true);
      }
    );
  });
}

function download_thumbnail(post, callback) {
  if (!post || !post.metadata || !post.metadata.thumbnail) return callback();

  var thumbnail = post.metadata.thumbnail;

  if (!thumbnail) return callback();

  fetchAsset(thumbnail, function (err, asset) {
    if (!asset) return callback();

    place(post, null, null, thumbnail, asset, function (ok) {
      callback(null, ok ? asset.name : undefined);
    });
  });
}

module.exports = function download_images(post, callback) {
  var changes = false;
  var $ = cheerio.load(post.html, { decodeEntities: false });

  // The directory is created lazily only if a download succeeds.
  download_thumbnail(post, function (err, thumbnail) {
    if (err) return callback(err);

    if (thumbnail) {
      changes = true;
      post.metadata.thumbnail = thumbnail;
    }

    each_el(
      $,
      "img",
      function (el, next) {
        var src = $(el).attr("src");

        if (!src) return next();

        fetchAsset(src, function (err, asset) {
          if (!asset) return next();

          place(post, el, $, src, asset, function (ok) {
            if (ok) changes = true;
            next();
          });
        });
      },
      function () {
        post.html = $.html();

        callback(null, post);
      }
    );
  });
};

function nameFrom(src, headers, format) {
  var name =
    filenameFromContentDisposition(headers && headers.contentDisposition) ||
    basename(parse(src).pathname) ||
    "image";

  try {
    name = decodeURIComponent(name);
  } catch (e) {
    // keep the raw name if it isn't valid percent-encoding
  }

  name = sanitizeFilename(name);

  if (name.charAt(0) !== "_") name = "_" + name;

  return ensureExtension(name, headers, format);
}

function filenameFromContentDisposition(header) {
  if (!header) return;

  // filename*=UTF-8''encoded-name.jpg
  var star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ""));
    } catch (e) {
      // fall through
    }
  }

  // filename="Koa Etymology Pie Chart.jpg"
  var quoted = /filename\s*=\s*"((?:\\.|[^"])*)"/i.exec(header);
  if (quoted) return quoted[1].replace(/\\(.)/g, "$1");

  var unquoted = /filename\s*=\s*([^;]+)/i.exec(header);
  if (unquoted) return unquoted[1].trim().replace(/^['"]|['"]$/g, "");
}

function sanitizeFilename(name) {
  return String(name)
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\0/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function ensureExtension(name, headers, format) {
  if (extname(name)) return name;

  var ext =
    extensionFromContentType(headers && headers.contentType) ||
    normalizeFormat(format);

  if (ext) return name + "." + ext;

  return name;
}

function extensionFromContentType(contentType) {
  if (!contentType) return;

  var type = String(contentType).split(";")[0].trim().toLowerCase();
  var ext = mime.extension(type);

  return ext || undefined;
}

function normalizeFormat(format) {
  if (!format) return;

  format = String(format).toLowerCase();

  // sharp reports "jpeg"; prefer the common file extension
  if (format === "jpeg") return "jpg";

  return format;
}

// Exported for tests
module.exports._nameFrom = nameFrom;
module.exports._filenameFromContentDisposition = filenameFromContentDisposition;
