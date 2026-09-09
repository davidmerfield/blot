// Byte-based ceilings for the text sources Blot turns into posts and pages.
// The limit exists to stop pathological files (e.g. a multi-megabyte
// TiddlyWiki export) from crashing the build, not to constrain real writing.
//
// Plain text / markdown gets the tighter limit: a post that large is already
// ~2 million characters. HTML keeps the historic, more generous limit because
// HTML sources legitimately carry markup and inline assets (base64 images can
// alone run to a few megabytes).
const BYTES_PER_MB = 1000 * 1000;

const MARKDOWN = { bytes: 2 * BYTES_PER_MB, label: "2 MB" };
const HTML = { bytes: 5 * BYTES_PER_MB, label: "5 MB" };

function isHTMLPath(path) {
  return /\.html?$/i.test(path || "");
}

// The limit that applies to a given source file, chosen by extension.
function limitForPath(path) {
  return isHTMLPath(path) ? HTML : MARKDOWN;
}

function tooLargeError(limit) {
  const label = (limit && limit.label) || MARKDOWN.label;
  const error = new Error(`File exceeds the ${label} post size limit`);
  error.code = "TOO_LARGE";
  return error;
}

module.exports = {
  MARKDOWN,
  HTML,
  limitForPath,
  tooLargeError,
};
