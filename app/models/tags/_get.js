const client = require("models/client");
const ensure = require("helper/ensure");
const type = require("helper/type");
const key = require("./key");
const hydrate = require("./_hydrate");

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
  batch.exists(sortedTagKey);

  batch.exec(async function (err, results) {
    if (err) return callback(err);

    const pretty = results[0] || tag;
    const exists = results[1];

    // we have not created the sorted set yet so we should iterate over all
    // tags for the blog and fetch the entries for those matching this tag
    // and populate the sorted sets accordingly. this should only happen once
    // per site and should affect all tags on the site.
    if (!exists) {
      try {
        await hydrate(blogID);
      } catch (e) {
        console.error("Error hydrating tags for blog:", blogID, e);
        return callback(e);
      }
    }

    var start = offset;
    var stop = limit === undefined ? -1 : offset + limit - 1;

    client.zrevrange(sortedTagKey, start, stop, function (err, entryIDs) {
      if (err) return callback(err);

      return callback(null, entryIDs, pretty);
    });
  });
};

