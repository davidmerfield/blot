var debug = require("debug")("blot:build:multiple");
var path = require("path");
var async = require("async");
var fs = require("fs-extra");
var localPath = require("helper/localPath");
var ensure = require("helper/ensure");
var pathNormalizer = require("helper/pathNormalizer");
var Single = require("./single");
var converters = require("./converters");

module.exports = function buildMultiple(blog, info, callback) {
  ensure(blog, "object")
    .and(info, "object")
    .and(info.folderPath, "string")
    .and(info.entryPath, "string")
    .and(callback, "function");

  const folderPath = pathNormalizer(info.folderPath);
  const entryPath = pathNormalizer(info.entryPath);

  debug("Blog:", blog.id, "building multiple for", folderPath);

  collectConvertibleFiles(blog, folderPath, function (err, files) {
    if (err) return callback(err);

    if (!files.length) {
      var emptyError = new Error(
        "No convertible files inside multi folder: " + folderPath
      );
      emptyError.code = "EMPTY";
      return callback(emptyError);
    }

    async.mapSeries(
      files,
      function (filePath, next) {
        Single(blog, filePath, function (
          err,
          html,
          metadata,
          stat,
          dependencies,
          extras,
        ) {
          if (err) {
            debug("Blog:", blog.id, filePath, "error building", err);
            return next(err);
          }

          next(null, {
            path: filePath,
            html: html,
            metadata: metadata || {},
            stat: stat || {},
            dependencies: dependencies || [],
            extras: extras || {},
          });
        });
      },
      function (err, results) {
        if (err) return callback(err);

        var combinedMetadata = {};
        var combinedDependencies = [];
        var combinedExtras = {};
        var combinedStat = {
          size: 0,
          mtime: 0,
          ctime: 0,
        };

        results.forEach(function (result) {
          combinedMetadata = mergeMetadata(combinedMetadata, result.metadata);
          combinedDependencies = combinedDependencies.concat(result.dependencies);
          combinedExtras = mergeMetadata(combinedExtras, result.extras);

          if (result.stat && typeof result.stat.size === "number") {
            combinedStat.size += result.stat.size;
          }

          if (result.stat && result.stat.mtime) {
            combinedStat.mtime = Math.max(
              combinedStat.mtime,
              new Date(result.stat.mtime).valueOf()
            );
          }

          if (result.stat && result.stat.ctime) {
            combinedStat.ctime = Math.max(
              combinedStat.ctime,
              new Date(result.stat.ctime).valueOf()
            );
          }
        });

        combinedDependencies = Array.from(new Set(combinedDependencies));

        var stat = {
          size: combinedStat.size,
        };

        if (combinedStat.mtime) stat.mtime = new Date(combinedStat.mtime);
        if (combinedStat.ctime) stat.ctime = new Date(combinedStat.ctime);

        if (!stat.mtime) stat.mtime = new Date();

        var metadata = Object.assign({}, combinedMetadata, {
          _sourcePaths: files,
        });

        var html = renderHtmlSections(results, folderPath);

        debug(
          "Blog:",
          blog.id,
          "multi entry",
          entryPath,
          "built from",
          files.length,
          "files"
        );

        callback(null, html, metadata, stat, combinedDependencies, combinedExtras);
      }
    );
  });
};

function collectConvertibleFiles(blog, folderPath, callback) {
  const files = [];

  function walk(currentPath, done) {
    const absolute = localPath(blog.id, currentPath);

    fs.readdir(absolute, { withFileTypes: true }, function (err, entries) {
      if (err) return done(err);

      entries = entries.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name, "en");
      });

      async.eachSeries(
        entries,
        function (entry, next) {
          const entryPath = pathNormalizer(
            path.join(currentPath, entry.name)
          );

          if (entry.isDirectory()) {
            if (entry.name.endsWith("+") && entryPath !== folderPath) {
              return next();
            }

            return walk(entryPath, next);
          }

          if (isPreviewFile(entry.name)) return next();

          if (!isConvertible(entryPath)) return next();

          files.push(entryPath);
          next();
        },
        done
      );
    });
  }

  walk(folderPath, function (err) {
    if (err) return callback(err);
    files.sort(function (a, b) {
      return a.localeCompare(b, "en");
    });
    callback(null, files);
  });
}

function renderHtmlSections(results, folderPath) {
  var sections = results.map(function (result, index) {
    var attributes = [
      'class="multi-file-entry"',
      'data-file="' + escapeAttribute(result.path) + '"',
      'data-index="' + index + '"',
    ];

    var extension = path.extname(result.path).slice(1);

    if (extension) {
      attributes.push(
        'data-extension="' + escapeAttribute(extension.toLowerCase()) + '"'
      );
    }

    var innerHtml = result.html || "";

    return (
      "\n  <section " +
      attributes.join(" ") +
      ">\n" +
      innerHtml +
      "\n  </section>"
    );
  });

  return (
    '<section class="multi-file-post" data-folder="' +
    escapeAttribute(folderPath) +
    '">' +
    sections.join("") +
    "\n</section>"
  );
}

function isConvertible(filePath) {
  return converters.some(function (converter) {
    return converter.is(filePath);
  });
}

function isPreviewFile(name) {
  return (
    name.endsWith(".preview.html") ||
    name.toLowerCase().indexOf("[preview]") > -1
  );
}

function mergeMetadata(target, source) {
  target = target || {};
  source = source || {};

  var result = {};

  Object.keys(target).forEach(function (key) {
    result[key] = cloneValue(target[key]);
  });

  Object.keys(source).forEach(function (key) {
    var incoming = source[key];

    if (Array.isArray(result[key]) && Array.isArray(incoming)) {
      result[key] = Array.from(new Set(result[key].concat(incoming)));
      return;
    }

    if (isPlainObject(result[key]) && isPlainObject(incoming)) {
      result[key] = mergeMetadata(result[key], incoming);
      return;
    }

    if (result[key] === undefined || result[key] === null || result[key] === "") {
      result[key] = cloneValue(incoming);
    }
  });

  Object.keys(result).forEach(function (key) {
    if (result[key] === undefined) delete result[key];
  });

  return result;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.slice();
  if (isPlainObject(value)) {
    var cloned = {};
    Object.keys(value).forEach(function (key) {
      cloned[key] = cloneValue(value[key]);
    });
    return cloned;
  }
  return value;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
