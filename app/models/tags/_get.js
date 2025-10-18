var client = require("models/client");
var ensure = require("helper/ensure");
var type = require("helper/type");
var entryGet = require("../entry/get");
var key = require("./key");

// This is a private method which assumes the
// tag has been normalized.
module.exports = function get(blogID, tag, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  ensure(blogID, "string").and(tag, "string").and(callback, "function");
  if (!type(options, "object")) throw new TypeError("Options must be an object");
  if (options.limit !== undefined) ensure(options.limit, "number");
  if (options.offset !== undefined) ensure(options.offset, "number");

  var limit = options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : undefined;
  var offset = options.offset !== undefined ? Math.max(0, Math.floor(options.offset)) : 0;

  const tagKey = key.name(blogID, tag);
  const tagSetKey = key.tag(blogID, tag);
  const sortedTagKey = key.sortedTag(blogID, tag);

  client.get(tagKey, function (err, prettyTag) {
    if (err) return callback(err);

    if (limit === 0) return callback(null, [], prettyTag);

    client.exists(sortedTagKey, function (err, exists) {
      if (err) return callback(err);

      if (!exists) return hydrateFromLegacy(prettyTag);

      client
        .multi()
        .scard(tagSetKey)
        .zcard(sortedTagKey)
        .exec(function (err, counts) {
          if (err) return callback(err);

          var legacyCount = counts && counts[0] ? counts[0] : 0;
          var sortedCount = counts && counts[1] ? counts[1] : 0;

          if (!legacyCount) {
            if (!sortedCount) return callback(null, [], prettyTag);
            return fetchFromSorted(prettyTag);
          }

          if (sortedCount >= legacyCount) return fetchFromSorted(prettyTag);

          hydrateFromLegacy(prettyTag);
        });
    });

    function hydrateFromLegacy(prettyTag) {
      client.smembers(tagSetKey, function (err, entryIDs) {
        if (err) return callback(err);

        if (!entryIDs || !entryIDs.length) {
          return callback(null, [], prettyTag);
        }

        hydrateSortedSet(entryIDs, function (err) {
          if (err) return callback(err);
          fetchFromSorted(prettyTag);
        });
      });
    }

    function fetchFromSorted(pretty) {
      var start = offset;
      var stop = limit === undefined ? -1 : offset + limit - 1;

      client.zrevrange(sortedTagKey, start, stop, function (err, entryIDs) {
        if (err) return callback(err);

        return callback(null, entryIDs, pretty);
      });
    }

    function hydrateSortedSet(entryIDs, done) {
      entryGet(blogID, entryIDs, function (entries) {
        if (!entries) return done();

        if (!type(entries, "array")) entries = [entries];

        if (!entries.length) return done();

        var multi = client.multi();
        var added = 0;

        entries.forEach(function (entry) {
          if (!entry || !entry.id) return;

          var score = entry.dateStamp;
          if (typeof score !== "number") score = 0;

          multi.zadd(sortedTagKey, score, entry.id);
          added += 1;
        });

        if (!added) return done();

        multi.exec(function (err) {
          if (err) return done(err);
          done();
        });
      });
    }
  });
};
