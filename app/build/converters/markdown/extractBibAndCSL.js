const fs = require("fs-extra");
const async = require("async");
const extractMetadata = require("build/metadata");
const localPath = require("helper/localPath");
const resolve = require("path").resolve;
const dirname = require("path").dirname;
const caseSensitivePath = require("helper/caseSensitivePath");

function getIgnoreCase(obj, key) {
  const lower = key.toLowerCase();
  const k = Object.keys(obj).find((x) => x.toLowerCase() === lower);
  return k ? obj[k] : undefined;
}

module.exports = function (blog, path, metadata, callback) {

  let paths = {
    bib: getIgnoreCase(metadata, "bibliography"),
    csl: getIgnoreCase(metadata, "csl"),
  };

  async.eachOf(
    paths,
    function (pathTo, key, next) {
      paths[key] = "";

      if (!pathTo) return next();

      if (pathTo[0] !== "/") {
        pathTo = resolve(dirname(path), pathTo);
      }

      const cwd = localPath(blog.id, "/");

      caseSensitivePath(cwd, pathTo, function (err, casePath) {
        if (err) {
          return next();
        }

        paths[key] = casePath;
        next();
      });
    },
    function (err) {
      callback(null, paths.bib, paths.csl);
    }
  );
};
