const fs = require("fs-extra");
const path = require("path");
const { promisify } = require("util");

const client = require("models/client");
const config = require("config");
const key = require("../key");
const generateCdnUrl = require("./generateCdnUrl");
const purgeCdnUrls = require("helper/purgeCdnUrls");

const delAsync = promisify(client.del).bind(client);

// Base directory for rendered output storage (same as updateCdnManifest.js)
const RENDERED_OUTPUT_BASE_DIR = path.join(config.data_directory, "cdn", "template");

function getRenderedOutputPath(hash, viewName) {
  const viewBaseName = path.basename(viewName);
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  const hashRemainder = hash.substring(4);
  return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hashRemainder, viewBaseName);
}

async function cleanupSingleEntry(target, hash, urlsToPurge) {
  if (!hash || typeof hash !== "string") return;

  try {
    const filePath = getRenderedOutputPath(hash, target);
    await fs.remove(filePath).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
  } catch (err) {
    console.error(`Error removing rendered output for ${target}:`, err);
  }

  try {
    const renderedKey = key.renderedOutput(hash);
    await delAsync(renderedKey);
  } catch (err) {
    console.error(`Error removing rendered output key for ${target}:`, err);
  }

  try {
    urlsToPurge.push(generateCdnUrl(target, hash));
  } catch (err) {
    console.error(`Error generating CDN URL for ${target}:`, err);
  }
}

async function cleanupCdnManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return;

  const urlsToPurge = [];

  const entries = Object.entries(manifest);
  for (const [target, hash] of entries) {
    await cleanupSingleEntry(target, hash, urlsToPurge);
  }

  try {
    await purgeCdnUrls(urlsToPurge);
  } catch (err) {
    console.error("Error purging CDN URLs:", err);
  }
}

module.exports = cleanupCdnManifest;

