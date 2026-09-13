// Process-local cache for Entry.getByUrl, used by augment.js when it
// hydrates entry.backlinks (URL strings → entry objects). A hub post with
// dozens of backlinks used to issue one Redis GET-then-GET per URL on every
// render, and eachEntry also augments next/previous, so the same URL was
// often resolved three times in one request. Keying on blogID + cacheID +
// url means a second render (or a concurrent burst) hits the LRU instead
// of Redis, and inflight de-dupes the same miss across entry/next/previous
// in a single request.
const LRUCache = require("lru-cache").LRUCache;
const { getEntryByUrl } = require("../../lib/models");
const { cloneDeep, deepFreeze } = require("../../lib/clone");

const entryByUrlCache = new LRUCache({
  max: 5000,
  // Byte-capped like the other app/blog render caches: a busy hub whose
  // backlinks are full entries (html/body included) must not evict every
  // other blog sharing this process.
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) => {
    if (value == null) return 1;
    return JSON.stringify(value).length;
  },
});

// Dedupes concurrent misses for the same key so entry / next / previous
// (and a burst of requests for the same hub) share one getByUrl.
const inflight = new Map();

function normalizeUrl(url) {
  const asString = String(url);
  try {
    return decodeURI(asString);
  } catch (e) {
    return asString;
  }
}

function createCacheKey(blog, url) {
  return JSON.stringify({
    blogID: String(blog && blog.id),
    cacheID: String(blog && blog.cacheID),
    url: normalizeUrl(url),
  });
}

function cloneEntry(value) {
  if (value == null) return value;
  return cloneDeep(value, { preserveEntryInstances: true });
}

async function getCachedEntryByUrl(blog, url) {
  const key = createCacheKey(blog, url);

  if (entryByUrlCache.has(key)) {
    return cloneEntry(entryByUrlCache.get(key));
  }

  if (inflight.has(key)) {
    return cloneEntry(await inflight.get(key));
  }

  const promise = getEntryByUrl(blog && blog.id, url).then((entry) => {
    // getByUrl collapses both a genuine missing URL and a Redis GET/MGET
    // failure to "no entry". Caching that would hide a real backlink after
    // Redis recovers, until cacheID changes or the LRU evicts - same
    // sticky-empty trap getAllCached avoids. Only persist resolved entries;
    // a miss (or blip) re-hits Redis, which is one GET.
    if (!entry) return null;
    const stored = deepFreeze(cloneEntry(entry));
    entryByUrlCache.set(key, stored);
    return stored;
  });

  inflight.set(key, promise);

  try {
    return cloneEntry(await promise);
  } finally {
    inflight.delete(key);
  }
}

module.exports = getCachedEntryByUrl;
module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  entryByUrlCache.clear();
  inflight.clear();
};
