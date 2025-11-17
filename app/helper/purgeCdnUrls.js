const config = require("config");
const fetch = require("node-fetch");

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
      const url = `https://api.bunny.net/purge?url=${encodeURIComponent(urlToPurge)}&async=false`;
      const res = await fetch(url, {
        method: "POST",
        headers: { AccessKey: config.bunny.secret },
      });

      if (res.status !== 200) {
        console.error(`Failed to purge Bunny CDN: ${urlToPurge}`, res.status);
      } else {
        console.log(`Purged Bunny CDN: ${urlToPurge}`);
      }
    } catch (err) {
      console.error(`Error purging Bunny CDN: ${urlToPurge}`, err);
    }
  }
}

module.exports = purgeCdnUrls;

