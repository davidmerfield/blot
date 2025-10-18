const client = require("models/client");
const ensure = require("helper/ensure");
const type = require("helper/type");
const key = require("./key");
const hydrate = require("./_hydrate");

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
    options.limit !== undefined
      ? Math.max(0, Math.floor(options.limit))
      : 10;
  var offset =
    options.offset !== undefined ? Math.max(0, Math.floor(options.offset)) : 0;

  if (limit === 0) return callback(null, []);

  const popularityKey = key.popular(blogID);
  const allKey = key.all(blogID);

  const batch = client.batch();
  batch.exists(popularityKey);
  batch.exists(allKey);
  batch.zcard(popularityKey);
  batch.scard(allKey);

  batch.exec(async function (err, results) {
    if (err) return callback(err);

    const popularityExists = results[0] === 1;
    const legacyExists = results[1] === 1;
    const popularityCount = Number(results[2]) || 0;
    const legacyCount = Number(results[3]) || 0;

    const countsMismatch = legacyCount > 0 && popularityCount < legacyCount;

    if (legacyExists && (!popularityExists || countsMismatch)) {
      try {
        await hydrate(blogID);
      } catch (e) {
        console.error("Error hydrating popular tags for blog:", blogID, e);
        return callback(e);
      }
    }

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
      }
    );
  });
};
