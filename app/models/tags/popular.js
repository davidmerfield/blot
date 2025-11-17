const client = require("models/client");
const ensure = require("helper/ensure");
const type = require("helper/type");
const key = require("./key");

module.exports = function getPopular(blogID, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (typeof options === "number") {
    options = { limit: options };
  }

  options = options || {};

  ensure(blogID, "string").and(callback, "function");

  if (!type(options, "object"))
    throw new TypeError("Options must be an object");

  if (options.limit !== undefined) ensure(options.limit, "number");
  if (options.offset !== undefined) ensure(options.offset, "number");

  var limit =
    options.limit !== undefined ? Math.max(0, Math.floor(options.limit)) : 10;
  var offset =
    options.offset !== undefined ? Math.max(0, Math.floor(options.offset)) : 0;

  if (limit === 0) return callback(null, []);

  const popularityKey = key.popular(blogID);
  client.zcard(popularityKey, function (err, total) {
    if (err) return callback(err);

    if (!total) return callback(null, []);

    var start = offset;
    var stop = offset + limit - 1;

    client.zrevrange(
      popularityKey,
      start,
      stop,
      "WITHSCORES",
      function (err, tagScores) {
        if (err) return callback(err);

        if (!tagScores || tagScores.length === 0) {
          return callback(null, []);
        }

        const tagsWithCounts = [];

        for (var i = 0; i < tagScores.length; i += 2) {
          const slug = tagScores[i];
          const count = parseInt(tagScores[i + 1], 10) || 0;

          if (!slug) continue;

          tagsWithCounts.push({ slug, count });
        }

        if (!tagsWithCounts.length) {
          return callback(null, []);
        }

        const detailsBatch = client.batch();

        tagsWithCounts.forEach(function ({ slug }) {
          detailsBatch.get(key.name(blogID, slug));
        });

        detailsBatch.exec(function (err, details) {
          if (err) return callback(err);

          const hydrated = [];

          tagsWithCounts.forEach(function ({ slug, count }, index) {
            if (!count) return;

            const name = details[index] || slug;
            const entries = Array.from({ length: count });

            hydrated.push({
              name,
              slug,
              entries,
              count,
            });
          });

          callback(null, hydrated);
        });
      },
    );
  });
};
