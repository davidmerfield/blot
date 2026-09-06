const ensure = require("helper/ensure");
const client = require("models/client");
const { promisify } = require("util");
const { sortEntries } = require("blog/sortOptions");
const metadataCaseInsensitive = require("helper/metadataCaseInsensitive");
const get = promisify((blogID, entryIDs, callback) =>
  require("./get")(blogID, entryIDs, function (entries) {
    callback(null, entries);
  })
);

const TIMEOUT = 8000;
const MAX_RESULTS = 25;
// When a sort is requested we cannot stop at the first MAX_RESULTS matches in
// Redis scan order — we need the whole match set so the first page is correct
// in the chosen order. Bounded by this ceiling and the timeout.
const MAX_COLLECT = 500;
const CHUNK_SIZE = 200;

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

module.exports = async function (blogID, query, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};

  ensure(blogID, "string").and(query, "string").and(callback, "function");

  const terms = query.split(/\s+/)
    .map(term => term.trim().toLowerCase())
    .filter(Boolean);

  if (!terms.length) {
    return callback(null, []);
  }

  const sorted = !!options.sortBy;
  const collectLimit = sorted ? MAX_COLLECT : MAX_RESULTS;

  const startTime = Date.now();
  const timedOut = () => Date.now() - startTime > TIMEOUT;
  const results = [];

  const isMatch = entry => {
    if (!isSearchable(entry)) return false;
    const text = buildSearchText(entry);
    return terms.length === 1
      ? text.includes(terms[0])
      : terms.every(term => text.includes(term));
  };

  const scanList = async key => {
    let cursor = "0";
    do {
      if (timedOut() || results.length >= collectLimit) return;

      const scanned = await client.zScan(key, cursor, { COUNT: CHUNK_SIZE });
      cursor = String(scanned.cursor);

      const ids = (scanned.members || []).map(member => member.value);
      if (!ids.length) continue;

      for (const entry of await get(blogID, ids)) {
        if (isMatch(entry)) results.push(entry);
        if (results.length >= collectLimit || timedOut()) return;
      }
    } while (cursor !== "0");
  };

  try {
    // The 'entries' list (rather than 'all') skips deleted entries; the 'pages'
    // list picks up any pages opted into search via metadata.
    await scanList("blog:" + blogID + ":entries");
    await scanList("blog:" + blogID + ":pages");

    const ordered = sorted ? sortEntries(results, options) : results;
    return callback(null, ordered.slice(0, MAX_RESULTS));
  } catch (error) {
    return callback(error);
  }
};
