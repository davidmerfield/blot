const config = require("config");
const fetch = require("node-fetch");

const DEFAULT_REQUESTS_PER_SECOND = 10;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

function delay(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * Purge a single URL from Bunny CDN cache with retry and exponential backoff.
 * Retries up to {@link MAX_RETRIES} times on transient errors such as HTTP 429.
 * Respects the `Retry-After` header when provided, otherwise falls back to
 * exponential backoff starting at {@link BASE_DELAY_MS} and capped at
 * {@link MAX_DELAY_MS}.
 *
 * @param {string} urlToPurge - The URL to purge (will be encoded internally)
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<boolean>} - Whether the purge succeeded
 */
async function purgeSingleUrl(urlToPurge, retryCount = 0) {
  const url = `https://api.bunny.net/purge?url=${encodeURIComponent(urlToPurge)}&async=false`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { AccessKey: config.bunny.secret },
    });

    if (res.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        console.error(`Failed to purge Bunny CDN after max retries: ${urlToPurge}`, res.status);
        return false;
      }

      const retryAfterHeader = res.headers && res.headers.get ? res.headers.get("Retry-After") : null;
      const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
      const backoffDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, retryCount));
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : backoffDelay;

      console.warn(`Rate limited purging Bunny CDN: ${urlToPurge}. Retrying in ${delayMs}ms (attempt ${retryCount + 1}).`);
      await delay(delayMs);
      return purgeSingleUrl(urlToPurge, retryCount + 1);
    }

    if (res.status !== 200) {
      console.error(`Failed to purge Bunny CDN: ${urlToPurge}`, res.status);
      return false;
    }

    console.log(`Purged Bunny CDN: ${urlToPurge}`);
    return true;
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      const delayMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, retryCount));
      console.warn(`Error purging Bunny CDN: ${urlToPurge}. Retrying in ${delayMs}ms (attempt ${retryCount + 1}).`, err);
      await delay(delayMs);
      return purgeSingleUrl(urlToPurge, retryCount + 1);
    }

    console.error(`Error purging Bunny CDN after max retries: ${urlToPurge}`, err);
    return false;
  }
}

/**
 * Purge URLs from Bunny CDN cache with throttling and retry logic.
 * Requests are spaced out using a configurable rate limit (default 10 rps) to
 * reduce the likelihood of hitting rate limits. Individual requests will retry
 * on HTTP 429 responses with exponential backoff and respect the `Retry-After`
 * header when present.
 *
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

  if (!Array.isArray(urls) || urls.length === 0) {
    return;
  }

  const requestsPerSecond = Math.max(
    1,
    config.bunny.requestsPerSecond || DEFAULT_REQUESTS_PER_SECOND
  );
  const minDelayBetweenRequests = 1000 / requestsPerSecond;
  const startTime = Date.now();
  let lastRequestTime = startTime - minDelayBetweenRequests;

  for (const urlToPurge of urls) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < minDelayBetweenRequests) {
      await delay(minDelayBetweenRequests - timeSinceLastRequest);
    }

    lastRequestTime = Date.now();
    await purgeSingleUrl(urlToPurge);
  }
}

module.exports = purgeCdnUrls;
module.exports._purgeSingleUrl = purgeSingleUrl;
module.exports._delay = delay;

