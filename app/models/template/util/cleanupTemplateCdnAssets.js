const purgeCdnUrls = require("helper/purgeCdnUrls");
const generateCdnUrl = require("./generateCdnUrl");
const { cleanupOldHash } = require("./updateCdnManifest");

function isValidHash(hash) {
  return typeof hash === "string" && /^[a-f0-9]{4,}$/i.test(hash);
}

async function cleanupTemplateCdnAssets(templateID, metadata) {
  try {
    const manifest =
      metadata && typeof metadata.cdn === "object" ? metadata.cdn : null;

    if (!manifest || Object.keys(manifest).length === 0) return;

    const entries = Object.entries(manifest);
    const urlsToPurge = [];

    for (const [target, hash] of entries) {
      if (!target || typeof target !== "string") continue;

      if (!isValidHash(hash)) {
        console.error(
          `Skipping CDN cleanup for ${templateID}:${target} due to invalid hash`
        );
        continue;
      }

      try {
        const url = generateCdnUrl(target, hash);
        urlsToPurge.push(url);
      } catch (err) {
        console.error(
          `Error generating CDN URL for ${templateID}:${target}:`,
          err
        );
      }
    }

    if (urlsToPurge.length) {
      try {
        await purgeCdnUrls(urlsToPurge);
      } catch (err) {
        console.error(`Error purging CDN URLs for ${templateID}:`, err);
      }
    }

    await Promise.all(
      entries.map(async ([target, hash]) => {
        try {
          await cleanupOldHash(target, hash);
        } catch (err) {
          console.error(
            `Error cleaning CDN assets for ${templateID}:${target}:`,
            err
          );
        }
      })
    );
  } catch (err) {
    console.error(`Error cleaning CDN assets for ${templateID}:`, err);
  }
}

module.exports = cleanupTemplateCdnAssets;
