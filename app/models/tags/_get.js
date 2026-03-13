const client = require("models/client");
const ensure = require("helper/ensure");
const type = require("helper/type");
const key = require("./key");

// This is a private method which assumes the tag has been normalized.
module.exports = function get(blogID, tag, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  ensure(blogID, "string").and(tag, "string").and(callback, "function");
  if (!type(options, "object"))
    throw new TypeError("Options must be an object");
  if (options.limit !== undefined) ensure(options.limit, "number");
  if (options.offset !== undefined) ensure(options.offset, "number");

  var limit =
    options.limit !== undefined
      ? Math.max(0, Math.floor(options.limit))
      : undefined;
  var offset =
    options.offset !== undefined ? Math.max(0, Math.floor(options.offset)) : 0;

  const tagKey = key.name(blogID, tag);
  const sortedTagKey = key.sortedTag(blogID, tag);

  const batch = client.batch();

  batch.get(tagKey);

  batch.exec(function (err, results) {
    if (err) return callback(err);

    const pretty = results[0] || tag;

    var start = offset;
    var stop = limit === undefined ? -1 : offset + limit - 1;

    const fetchBatch = client.batch();

    fetchBatch.zcard(sortedTagKey);
    fetchBatch.zrevrange(sortedTagKey, start, stop);

    fetchBatch.exec(function (err, results) {
      if (err) return callback(err);

      const total = results[0] || 0;
      const entryIDs = results[1] || [];

      return callback(null, entryIDs, pretty, total);
    });
  });
};

