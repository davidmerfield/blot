const fs = require("fs");
const Entries = require("models/entries");
const Entry = require("models/entry");
const localPath = require("helper/localPath");
const async = require("async");

function resolvePath(blogID, path, callback) {
  if (typeof path !== "string" || !path.trim()) {
    return callback(new Error("INVALID_PATH: " + String(path)));
  }

  var candidates = [];

  candidates.push(path);
  // try removing leading whitespace
  candidates.push(path.trim());

  // 1 /Foo/Bar/Baz/Bat.jpg
  // - /Foo/Bar/Baz/bat.jpg
  // - /Foo/Bar/baz/bat.jpg
  // - /Foo/bar/baz/bat.jpg
  // - /foo/bar/baz/bat.jpg

  if (path.toLowerCase() !== path) {
    var dirs = path.split("/");

    for (var i = dirs.length - 1; i >= 0; i--) {
      dirs[i] = dirs[i].toLowerCase();
      candidates.push(dirs.join("/"));
      candidates.push(dirs.join("/").trim());
    }
  }

  async.detect(
    candidates,
    function (filePath, callback) {
      fs.access(localPath(blogID, filePath), function (err) {
        callback(null, !err);
      });
    },
    function (err, match) {
      if (err || !match) {
        return callback(err || new Error("ENOENT: " + path));
      }
      callback(null, match);
    }
  );
}
// The purpose of this script was to resolve an issue with entries having
// path properties that were not equal to the location of the file on disk
// if the file system is case sensitive.
function main (blog, callback) {
  var missing = [];
  var edit = [];
  var report = [];

  Entries.each(blog.id, function (_entry, next) {
    if (!_entry) return next();

    if (_entry.deleted) return next();

    if (typeof _entry.path !== "string" || !_entry.path.trim()) {
      missing.push({ entry: _entry, path: _entry && _entry.path });
      return next();
    }

    resolvePath(blog.id, _entry.path, function (err, path) {
      if (path && path !== _entry.path) {
        edit.push({ entry: _entry, path: path });
      } else if (err) {
        missing.push({ entry: _entry, path: _entry.path });
      }
      next();
    });
  },
    function (err) {
      if (err) return callback(err);

      if (!missing.length && !edit.length) {
        return callback();
      }

      if (missing.length) {
        report.push(
          missing.length +
            " files are missing from the disk for entries which are not deleted"
        );
        report.push(missing);
      }

      if (edit.length) {
        report.push(
          edit.length + "files exists on disk with a different case.."
        );
        report.push(edit);
      }

      async.eachSeries(
        edit,
        function (item, next) {
          Entry.set(blog.id, item.entry.path, { path: item.path }, next);
        },
        function (err) {
          if (err) return callback(err);

          async.eachSeries(
            missing,
            function (item, next) {
              Entry.drop(blog.id, item.entry.path, next);
            },
            function (err) {
              if (err) return callback(err);
              callback(null, report);
            }
          );
        }
      );
    }
  );
}

module.exports = main;
