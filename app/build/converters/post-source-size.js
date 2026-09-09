const BYTES_PER_MEBIBYTE = 1024 * 1024;
const MAX_POST_SOURCE_SIZE_BYTES = 5 * BYTES_PER_MEBIBYTE;
const MAX_POST_SOURCE_SIZE_LABEL = "5 MB";

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
