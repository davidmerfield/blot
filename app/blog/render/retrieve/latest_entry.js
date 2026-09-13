const { getPage } = require("../../lib/models");
const projectEntryFields = require("./helpers/projectEntryFields");
const asRetriever = require("../../lib/asRetriever");
const LRUCache = require("lru-cache").LRUCache;
const { cloneDeep, deepFreeze } = require("../../lib/clone");

const ALIASES = ["latestEntry", "latest_entry"];

const latestEntryCache = new LRUCache({
  max: 1000,
  // One full entry (including html) per blog; byte-cap so a few large
  // posts cannot dominate the process by item count alone.
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => JSON.stringify(value).length,
});

function cloneEntry(value) {
  return cloneDeep(value, { preserveEntryInstances: true });
}

function createCacheKey(blog) {
  return JSON.stringify({
    blogID: String(blog && blog.id),
    cacheID: String(blog && blog.cacheID),
  });
}

async function latestEntry(req, res) {
  const log = typeof req?.log === "function" ? req.log.bind(req) : () => {};
  const key = createCacheKey(req.blog);

  if (latestEntryCache.has(key)) {
    log("Retrieved latest entry from cache");
    return projectEntryFields(
      cloneEntry(latestEntryCache.get(key)),
      req.retrieve,
      ALIASES
    );
  }

  log("Loading latest entry");
  const { entries } = await getPage(req.blog.id, {
    pageNumber: 1,
    pageSize: 1,
  });
  log("Loaded latest entry");
  const latest = entries && entries.length ? entries[0] : {};

  // getPage rejects on Redis failure, so an empty {} here is a genuinely
  // empty blog and is safe to cache until cacheID changes.
  latestEntryCache.set(key, deepFreeze(cloneEntry(latest)));

  return projectEntryFields(cloneEntry(latest), req.retrieve, ALIASES);
}

module.exports = asRetriever(latestEntry);
module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  latestEntryCache.clear();
};
