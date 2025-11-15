const config = require("config");
const path = require("path");

/**
 * Generate a CDN URL for a template view
 * @param {string} viewName - The view name (e.g., "style.css" or "partials/header.html")
 * @param {string} hash - The hash for the view content
 * @returns {string} The CDN URL in format: /rendered/{hash[0:2]}/{hash[2:4]}/{hash}
 */
function generateCdnUrl(viewName, hash) {
  if (!viewName || typeof viewName !== "string") {
    throw new Error("viewName must be a non-empty string");
  }

  if (!hash || typeof hash !== "string" || hash.length < 4) {
    throw new Error("hash must be a non-empty string with at least 4 characters");
  }

  // New URL format matches disk structure: /rendered/{hash[0:2]}/{hash[2:4]}/{hash}{ext}
  // Extension is included in URL for content-type detection, but file on disk has no extension
  const ext = path.extname(viewName) || "";
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  return config.cdn.origin + "/rendered/" + dir1 + "/" + dir2 + "/" + hash + ext;
}

/**
 * Encode view segment by splitting on "/" and encoding each part
 * @param {string} segment - The view segment to encode
 * @returns {string} The encoded segment
 */
function encodeViewSegment(segment) {
  if (!segment) return "";

  return segment
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");
}

module.exports = generateCdnUrl;

