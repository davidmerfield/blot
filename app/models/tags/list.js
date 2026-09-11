const client = require("models/client");
const ensure = require("helper/ensure");
const { normalizePathPrefix, filterEntryIDsByPathPrefix } = require("helper/pathPrefix");
const key = require("./key");

module.exports = async function getAll(blogID, options, callback) {
  try {
    if (typeof options === "function") {
      callback = options;
      options = null;
    }

    ensure(blogID, "string").and(callback, "function");

    options = options || {};
    const pathPrefix = normalizePathPrefix(options.pathPrefix || options.path_prefix);

    const allTags = (await client.sMembers(key.all(blogID))) || [];

    if (allTags.length === 0) {
      return callback(null, []); // No tags to process
    }

    // Fetch every tag's name + entries (or count) in one round trip instead
    // of 2 sequential round trips per tag.
    const pipeline = client.multi();
    for (const tag of allTags) {
      pipeline.get(key.name(blogID, tag));
      if (pathPrefix) {
        pipeline.zRange(key.sortedTag(blogID, tag), 0, -1);
      } else {
        pipeline.zCard(key.sortedTag(blogID, tag));
      }
    }
    const results = await pipeline.exec();

    const tags = [];
    for (let i = 0; i < allTags.length; i++) {
      const tag = allTags[i];
      const name = results[i * 2] || "";
      const second = results[i * 2 + 1];

      if (pathPrefix) {
        const entries = filterEntryIDsByPathPrefix(second || [], pathPrefix);

        if (!entries.length) continue;

        tags.push({
          name,
          slug: tag,
          entries,
        });

        continue;
      }

      const count = second || 0;

      if (count > 0) {
        tags.push({
          name,
          slug: tag,
          entries: new Array(count).fill(null),
        });
      }
    }

    return callback(null, tags);
  } catch (error) {
    return callback(error);
  }
};
