const client = require("models/client-new");
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

    // Iterate over tags and fetch their details
    const tags = [];
    for (const tag of allTags) {
      const name = (await client.get(key.name(blogID, tag))) || "";

      if (pathPrefix) {
        const entries = filterEntryIDsByPathPrefix(
          (await client.zRange(key.sortedTag(blogID, tag), 0, -1)) || [],
          pathPrefix
        );

        if (!entries.length) continue;

        tags.push({
          name,
          slug: tag,
          entries,
        });

        continue;
      }

      const count = (await client.zCard(key.sortedTag(blogID, tag))) || 0;

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
