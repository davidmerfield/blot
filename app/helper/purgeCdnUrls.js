const config = require("config");
const fetch = require("node-fetch");
const Bottleneck = require("bottleneck");

const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 250,
});

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 300;
const MAX_RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headers) {
  if (!headers || typeof headers.get !== "function") {
    return 0;
  }

  const retryAfter = headers.get("retry-after");
  if (!retryAfter) {
    return 0;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryDateMs = Date.parse(retryAfter);
  if (Number.isNaN(retryDateMs)) {
    return 0;
  }

  return Math.max(0, retryDateMs - Date.now());
}

function getBackoffDelayMs(attempt) {
  const exponentialDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** (attempt - 1)
  );
  const jitter = Math.floor(Math.random() * BASE_RETRY_DELAY_MS);
  return Math.min(MAX_RETRY_DELAY_MS, exponentialDelay + jitter);
}

async function purgeUrlWithRetries(urlToPurge) {
  const totalAttempts = MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      const url = `https://api.bunny.net/purge?url=${encodeURIComponent(urlToPurge)}&async=false`;
      const res = await fetch(url, {
        method: "POST",
        headers: { AccessKey: config.bunny.secret },
      });

      if (res.status === 200) {
        console.log(
          `Purged Bunny CDN: ${urlToPurge} (attempt ${attempt}/${totalAttempts})`
        );
        return;
      }

      if (res.status === 429 && attempt < totalAttempts) {
        const retryAfterMs = parseRetryAfterMs(res.headers);
        const backoffDelayMs = getBackoffDelayMs(attempt);
        const delayMs = Math.max(retryAfterMs, backoffDelayMs);
        await sleep(delayMs);
        continue;
      }

      console.error(
        `Failed to purge Bunny CDN: ${urlToPurge} (attempt ${attempt}/${totalAttempts})`,
        res.status
      );
      return;
    } catch (err) {
      console.error(
        `Error purging Bunny CDN: ${urlToPurge} (attempt ${attempt}/${totalAttempts})`,
        err
      );
      return;
    }
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

  if (!Array.isArray(urls) || urls.length === 0) {
    return;
  }

  for (const urlToPurge of urls) {
    try {
      await limiter.schedule(() => purgeUrlWithRetries(urlToPurge));
    } catch (err) {
      console.error(`Error purging Bunny CDN: ${urlToPurge}`, err);
    }
  }
}

module.exports = purgeCdnUrls;
