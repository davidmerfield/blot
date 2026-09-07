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
var Transformer = require("helper/transformer");
var hash = require("helper/hash");
var tempDir = require("helper/tempDir")();

// Consider using this algorithm to determine best part of alt tag or caption to use
// as the file's name:
// http://www.bearcave.com/misl/misl_tech/wavelets/compression/shannon.html

// Remote assets are fetched through helper/transformer rather than a bare
// fetch() here. That buys us three things the old hand-rolled download lacked:
//
//   1. SSRF protection - transformer/download routes every request through the
//      airlock forward proxy (see config/airlock), which filters egress to
//      private ranges, cloud metadata endpoints and DNS-rebinding targets. An
//      import pulls arbitrary URLs out of a user-supplied WordPress/Blogger/
//      Are.na export, so this matters.
//   2. Deduplication - the same image URL referenced by many posts (or by a
//      re-run of a failed import) is downloaded and inspected once, then served
//      from cache keyed by the file's content hash.
//   3. Conditional requests - stored ETag/Last-Modified mean an unchanged
//      remote asset is not re-downloaded on a later import.
//
// The store is namespaced "import" rather than per-blog: an import stages files
// into a temp directory before the blog folder exists, and identical asset URLs
// should dedupe across every blog's imports. flush() is never called here.
var cache = new Transformer("import", "images");

// transformer deletes the downloaded temp file as soon as the transform
// callback returns, and a cache hit hands back only the stored JSON (no bytes),
// so the transform copies each asset into this stable, content-addressed
// directory. download_images() then materialises the per-post asset file from
// here on both a miss and a hit.
var IMAGE_CACHE_DIR = join(tempDir, "import-image-cache");
fs.ensureDirSync(IMAGE_CACHE_DIR);

// Resolve a remote src to a cached asset: { name, cachePath, format }. Calls
// back with no result (rather than an error) for anything we should skip -
// data: URIs, unparseable hosts, download failures - matching the old
// behaviour of leaving the original src untouched.
function localize(src, callback) {
  if (!src || src.indexOf("data:") === 0) return callback();

  try {
    if (!parse(src).hostname) return callback();
  } catch (e) {
    return callback();
  }

  cache.lookup(src, persist(src), function (err, result) {
    if (err) {
      console.log("Failed to localize image", src, err.message);
      return callback();
    }

    if (!result || !result.name || !result.cachePath) return callback();

    callback(result);
  });
}

// The transform. Only runs on a cache miss; receives the path of the freshly
// downloaded temp file. transformer has already applied the airlock proxy,
// redirect cap and timeout.
function persist(src) {
  return function (path, done) {
    sharp(path).metadata(function (err, metadata) {
      // Response headers are not available to a transform, so the filename is
      // derived from the URL plus sharp's detected format only (a Blogger
      // opaque URL therefore loses its Content-Disposition filename - an
      // accepted, cosmetic trade for the airlock/dedup wins above).
      var format = metadata && metadata.format ? metadata.format : undefined;
      var name = nameFrom(src, null, format);
      var cachePath = join(IMAGE_CACHE_DIR, hash(src) + extname(name));

      fs.copy(path, cachePath, { overwrite: true }, function (err) {
        if (err) return done(err);
        done(null, { name: name, cachePath: cachePath, format: format || null });
      });
    });
  };
}

// Copy a localized asset into the entry's staging directory and rewrite the
// element. A missing cachePath (temp dir pruned between imports) surfaces here
// as a copy error and is skipped, same as any other download failure.
function place(post, el, $, src, result, next) {
  assetDirectory(post, function (err, directory) {
    if (err) return next(false);

    fs.copy(
      result.cachePath,
      join(directory, result.name),
      { overwrite: true },
      function (err) {
        if (err) {
          console.log("Failed to copy cached image", src, err.message);
          return next(false);
        }

        if (el) {
          $(el).attr("src", result.name);
          if ($(el).parent().attr("href") === src)
            $(el).parent().attr("href", result.name);
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

  localize(thumbnail, function (result) {
    if (!result) return callback();

    place(post, null, null, thumbnail, result, function (ok) {
      callback(null, ok ? result.name : undefined);
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

        localize(src, function (result) {
          if (!result) return next();

          place(post, el, $, src, result, function (ok) {
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
