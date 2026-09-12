var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var bucket = require("./_bucket");

// Rebuilds the archives index for a blog from scratch, from the canonical
// "entries" sorted set (already exactly the published/visible posts
// archives should show - see models/entries/index.js's getAll). Mirrors
// models/entries/pathIndex.js's backfillIndex: cheap to call repeatedly,
// safe to call on a blog with no entries, sets a "ready" flag when done.
//
// Blog and Entries are required lazily (inside the function, not at module
// scope) because both eventually require models/blog/set.js, which requires
// this module's index (to trigger a rebuild on timezone change) - a
// module-scope require here would deadlock on that cycle.
module.exports = function rebuild(blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  var Blog = require("../blog");
  var Entries = require("../entries");

  (async function () {
    var blog = await new Promise(function (resolve, reject) {
      Blog.get({ id: blogID }, function (err, blog) {
        if (err) return reject(err);
        if (!blog) return reject(new Error("Blog not found: " + blogID));
        resolve(blog);
      });
    });

    var entries = await new Promise(function (resolve, reject) {
      Entries.getAll(blogID, { fields: ["dateStamp"] }, function (entries) {
        resolve(entries || []);
      });
    });

    var staleYearMonths = await client.zRange(key.months(blogID), 0, -1);

    var buckets = Object.create(null);

    entries.forEach(function (entry) {
      if (!entry || typeof entry.dateStamp !== "number") return;

      var yearMonth = bucket.yearMonth(entry.dateStamp, blog.timeZone);

      if (!buckets[yearMonth]) buckets[yearMonth] = [];
      buckets[yearMonth].push(entry);
    });

    var multi = client.multi();

    staleYearMonths.forEach(function (yearMonth) {
      multi.del(key.bucket(blogID, yearMonth));
    });

    multi.del(key.months(blogID));

    Object.keys(buckets).forEach(function (yearMonth) {
      multi.zAdd(key.months(blogID), {
        score: bucket.score(yearMonth),
        value: yearMonth,
      });

      buckets[yearMonth].forEach(function (entry) {
        multi.zAdd(key.bucket(blogID, yearMonth), {
          score: entry.dateStamp,
          value: entry.id,
        });
        multi.set(key.entry(blogID, entry.id), yearMonth);
      });
    });

    multi.set(key.ready(blogID), "1");

    await multi.exec();

    callback(null, entries.length);
  })().catch(function (err) {
    callback(err);
  });
};
