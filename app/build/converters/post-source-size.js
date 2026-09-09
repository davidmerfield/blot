// Shared byte-based ceiling for text sources (txt / markdown / html) that
// Blot turns into posts and pages. A plain-text or markdown post this large
// is already ~2 million characters; the limit exists to stop pathological
// files (e.g. a multi-megabyte TiddlyWiki export) from crashing the build,
// not to constrain real writing.
const BYTES_PER_MB = 1000 * 1000;
const MAX_POST_SOURCE_SIZE_BYTES = 2 * BYTES_PER_MB;
const MAX_POST_SOURCE_SIZE_LABEL = "2 MB";

function tooLargeError() {
  const error = new Error(
    `File exceeds the ${MAX_POST_SOURCE_SIZE_LABEL} post size limit`
  );
  error.code = "TOO_LARGE";
  return error;
}

module.exports = {
  MAX_POST_SOURCE_SIZE_BYTES,
  MAX_POST_SOURCE_SIZE_LABEL,
  tooLargeError,
};
