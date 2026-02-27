const ensure = require("helper/ensure");
const client = require("models/client");
const { promisify } = require("util");
const get = promisify((blogID, entryIDs, callback) =>
  require("./get")(blogID, entryIDs, function (entries) {
    callback(null, entries);
  })
);

const TIMEOUT = 8000;
const MAX_RESULTS = 25;
const CHUNK_SIZE = 200;
const metadataCaseInsensitive = require("helper/metadataCaseInsensitive");

function buildSearchText(entry) {
  return [
    entry.title,
    entry.permalink,
    entry.tags.join(" "),
    entry.path,
    entry.html,
    Object.values(entry.metadata).join(" ")
  ].join(" ").toLowerCase();
}

function isSearchable(entry) {
  const metadataByLowercaseKey = metadataCaseInsensitive(entry.metadata);

  if (entry.deleted || entry.draft) return false;
  if (entry.page && (!metadataByLowercaseKey.search || isFalsy(metadataByLowercaseKey.search))) return false;
  if (metadataByLowercaseKey.search && isFalsy(metadataByLowercaseKey.search)) return false;
  return true;
}

function isFalsy(value) {
  value = value.toString().toLowerCase().trim();
  return value === "false" || value === "no" || value === "0";
}

module.exports = async function (blogID, query, callback) {
  ensure(blogID, "string").and(query, "string").and(callback, "function");

  const terms = query.split(/\s+/)
    .map(term => term.trim().toLowerCase())
    .filter(Boolean);

  if (!terms.length) {
    return callback(null, []);
  }

  const startTime = Date.now();
  const results = [];

  function checkTimeout() {
    return Date.now() - startTime > TIMEOUT;
  }

  async function scanAndCollect(key) {
    for await (const tuples of client.zScanIterator(key, { COUNT: CHUNK_SIZE })) {
      if (checkTimeout()) {
        return false;
      }

      const ids = tuples.length && typeof tuples[0] === "object"
        ? tuples.map((tuple) => tuple.value)
        : tuples.filter((_, i) => i % 2 === 0);

      if (!ids.length) {
        continue;
      }

      const entries = await get(blogID, ids);

      for (const entry of entries) {
        if (!isSearchable(entry)) continue;

        const text = buildSearchText(entry);

        const matches = terms.length === 1
          ? text.includes(terms[0])
          : terms.every(term => text.includes(term));

        if (matches) {
          results.push(entry);
          if (results.length >= MAX_RESULTS) {
            return false;
          }
        }

        if (checkTimeout()) {
          return false;
        }
      }
    }

    return true;
  }

  try {
    // we use the entries list rather than the 'all' list to skip deleted entries
    // this can badly affect performance if there are a lot of deleted entries
    if (!await scanAndCollect("blog:" + blogID + ":entries")) {
      return callback(null, results);
    }

    // now we check the 'pages' list for any pages which might be searchable
    if (!await scanAndCollect("blog:" + blogID + ":pages")) {
      return callback(null, results);
    }

    return callback(null, results);
  } catch (error) {
    return callback(error);
  }
};
