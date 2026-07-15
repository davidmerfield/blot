const Blog = require("models/blog");
const entryGhosts = require("./entry-ghosts");
const listGhosts = require("./list-ghosts");
const menuGhosts = require("./menu-ghosts");
const tagGhosts = require("./tag-ghosts");
const entriesPathIndex = require("./entries-path-index");
const async = require("async");
const callOnce = require("helper/callOnce");

module.exports = function (blog, callback) {
  if (!blog) {
    throw new TypeError("Fix: Expected blog as first argument");
  }

  if (typeof callback !== "function") {
    throw new TypeError("Fix: Expected callback as second argument");
  }

  const finalReport = {};

  async.eachSeries(
    [entryGhosts, tagGhosts, listGhosts, menuGhosts, entriesPathIndex],
    function (fn, next) {
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
