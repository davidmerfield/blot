const { fetchMetadata } = require("./remote");
const { getCachePath, readCache, writeCache } = require("./cache");
const { sanitizeMetadata, fallbackMetadata } = require("./metadata");
const { ensureThumbnails } = require("./thumbnails");

async function loadMetadata(href, blogID, transformers = {}) {
  if (!href) return null;

  const cachePath = getCachePath(blogID, href);

  const cached = await readCache(cachePath);
  if (cached) {
    sanitizeMetadata(cached, href);
    cached.url = href;
    await ensureThumbnails(cached, blogID, transformers.image);
    await writeCache(cachePath, cached);
    return cached;
  }

  const fetched = await fetchMetadata(href, transformers.html);
  if (fetched) {
    sanitizeMetadata(fetched, href);
    fetched.url = href;
    await ensureThumbnails(fetched, blogID, transformers.image);
    await writeCache(cachePath, fetched);
    return fetched;
  }

  const fallback = fallbackMetadata(href);
  if (fallback) return fallback;

  return null;
}

module.exports = {
  loadMetadata,
};
