const config = require("config");
const path = require("path");

/**
 * Generate a CDN URL for a template view
 * @param {string} viewName - The view name (e.g., "style.css" or "partials/header.html")
 * @param {string} hash - The hash for the view content
 * @returns {string} The CDN URL in format: /template/{encodedView}.{hash}.{ext}
 */
function generateCdnUrl(viewName, hash) {
  if (!viewName || typeof viewName !== "string") {
    throw new Error("viewName must be a non-empty string");
  }

  if (!hash || typeof hash !== "string") {
    throw new Error("hash must be a non-empty string");
  }

  const ext = path.extname(viewName) || "";
  const viewNameWithoutExtension = ext
    ? viewName.slice(0, -ext.length)
    : viewName;

  const encodedView = encodeViewSegment(viewNameWithoutExtension);

  // URL format: /template/viewname.digest.extension
  return config.cdn.origin + "/template/" + encodedView + "." + hash + ext;
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

