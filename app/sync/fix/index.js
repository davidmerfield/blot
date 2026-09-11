const Blog = require("models/blog");
const entryGhosts = require("./entry-ghosts");
const listGhosts = require("./list-ghosts");
const menuGhosts = require("./menu-ghosts");
const tagGhosts = require("./tag-ghosts");
const entriesPathIndex = require("./entries-path-index");
const async = require("async");
const callOnce = require("helper/callOnce");
const messenger = require("../messenger");

module.exports = function (blog, options, callback) {
  if (!blog) {
    throw new TypeError("Fix: Expected blog as first argument");
  }

  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (typeof callback !== "function") {
    throw new TypeError("Fix: Expected callback as second argument");
  }

  const finalReport = {};
  const fallbackMessenger = options.status ? null : messenger(blog);
  const status = options.status || fallbackMessenger.status;
  const checks = [
    entryGhosts,
    tagGhosts,
    listGhosts,
    menuGhosts,
    entriesPathIndex,
  ];
  let current = 0;

  async.eachSeries(
    checks,
    function (fn, next) {
      current += 1;
      status(`(${current}/${checks.length}) Checking ${fn.name}`);
      fn(
        blog,
        callOnce(function (err, report) {
          if (err) return next(err);
          if (report && report.length) finalReport[fn.name] = report;
          next();
        })
      );
    },
    function (err) {
      // if final report is empty return immediately
      if (!Object.keys(finalReport).length) {
        return callback(err, finalReport);
      }

      // otherwise set cacheID to force cache invalidation
      const cacheID = Date.now();
      Blog.set(blog.id, { cacheID }, function (err) {
        callback(err, finalReport);
      });
    }
  );
};
