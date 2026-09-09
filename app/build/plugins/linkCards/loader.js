const { fetchMetadata } = require("./remote");
const { getCachePath, readCache, writeCache } = require("./cache");
const { sanitizeMetadata, fallbackMetadata } = require("./metadata");
const { ensureThumbnails } = require("./thumbnails");
const { ensureIcon } = require("./icons");
const { NEGATIVE_CACHE_TTL } = require("./constants");

async function loadMetadata(href, blogID, transformers = {}) {
  if (!href) return null;

  const cachePath = getCachePath(blogID, href);

  const cached = await readCache(cachePath);
  if (cached && cached.fallback) {
    // Negative cache entry from a previous failed lookup. Keep serving the
    // hostname-only card until it expires rather than re-hitting the network
    // on every rebuild.
    if (isFreshNegativeCache(cached)) {
      return fallbackMetadata(href);
    }
  } else if (cached) {
    sanitizeMetadata(cached, href);
    cached.url = href;
    await ensureThumbnails(cached, blogID, transformers.image);
    await ensureIcon(cached, blogID);
    await writeCache(cachePath, cached);
    return cached;
  }

  const fetched = await fetchMetadata(href, transformers.html);
  if (fetched) {
    sanitizeMetadata(fetched, href);
    fetched.url = href;
    await ensureThumbnails(fetched, blogID, transformers.image);
    await ensureIcon(fetched, blogID);
    await writeCache(cachePath, fetched);
    return fetched;
  }

  const fallback = fallbackMetadata(href);
  if (fallback) {
    await writeCache(cachePath, { fallback: true, cachedAt: Date.now() });
    return fallback;
  }

  return null;
}

function isFreshNegativeCache(cached) {
  const cachedAt = Number(cached && cached.cachedAt);
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt < NEGATIVE_CACHE_TTL;
}

module.exports = {
  loadMetadata,
};
