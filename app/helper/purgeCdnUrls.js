const config = require("config");
const fetch = require("node-fetch");

const MAX_URLS_PER_REQUEST = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const PURGE_ENDPOINT = "https://api.bunny.net/purge";

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function normalizeUrls(urls) {
  if (!Array.isArray(urls)) return [];

  const uniqueUrls = new Set();

  for (const url of urls) {
    if (typeof url !== "string") continue;

    try {
      uniqueUrls.add(new URL(url).toString());
    } catch (err) {
      console.error(`Skipping invalid URL for Bunny CDN purge: ${url}`);
    }
  }

  return Array.from(uniqueUrls);
}

function toBatches(items, size) {
  const batches = [];

  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }

  return batches;
}

async function purgeBatch(batch, attempt = 0, backoffMs = INITIAL_BACKOFF_MS) {
  try {
    const res = await fetch(PURGE_ENDPOINT, {
      method: "POST",
      headers: {
        AccessKey: config.bunny.secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: batch.map(encodeURIComponent), async: false }),
    });

    if (res.status === 200) {
      console.log(`Purged Bunny CDN URLs: ${batch.join(", ")}`);
      return;
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryDelayMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : backoffMs;

      await sleep(retryDelayMs);

      return purgeBatch(batch, attempt + 1, backoffMs * 2);
    }

    console.error(`Failed to purge Bunny CDN: ${batch.join(", ")}`, res.status);
  } catch (err) {
    console.error(`Error purging Bunny CDN: ${batch.join(", ")}`, err);
  }
}

/**
 * Purge URLs from Bunny CDN cache
 * @param {string[]} urls - Array of URLs to purge (will be encoded internally)
 * @returns {Promise<void>}
 */
async function purgeCdnUrls(urls) {
  if (config.environment !== "production") {
    return;
  }

  if (!config.bunny || !config.bunny.secret) {
    return;
  }

  const normalizedUrls = normalizeUrls(urls);

  if (normalizedUrls.length === 0) {
    return;
  }

  const batches = toBatches(normalizedUrls, MAX_URLS_PER_REQUEST);

  for (const batch of batches) {
    await purgeBatch(batch);
  }
}

module.exports = purgeCdnUrls;

