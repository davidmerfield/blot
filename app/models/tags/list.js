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

    // Fetch all tags using SMEMBERS
    const allTags = await new Promise((resolve, reject) => {
      client.smembers(key.all(blogID), (err, result) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });

    if (allTags.length === 0) {
      return callback(null, []); // No tags to process
    }

    // Iterate over tags and fetch their details
    const tags = [];
    for (const tag of allTags) {
      const name = await new Promise((resolve, reject) => {
        client.get(key.name(blogID, tag), (err, result) => {
          if (err) return reject(err);
          resolve(result || "");
        });
      });

      if (pathPrefix) {
        const entries = await new Promise((resolve, reject) => {
          client.zrange(key.sortedTag(blogID, tag), 0, -1, (err, result) => {
            if (err) return reject(err);
            resolve(filterEntryIDsByPathPrefix(result, pathPrefix));
          });
        });

        if (!entries.length) continue;

        tags.push({
          name,
          slug: tag,
          entries,
        });

        continue;
      }

      const count = await new Promise((resolve, reject) => {
        client.zcard(key.sortedTag(blogID, tag), (err, result) => {
          if (err) return reject(err);
          resolve(result || 0);
        });
      });

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
