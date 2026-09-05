const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

const UNSUPPORTED_FILE_EXTENSIONS = [".paper"];

const hasUnsupportedExtension = (filePath = "") => {
  const normalizedPath = String(filePath).toLowerCase();
  return UNSUPPORTED_FILE_EXTENSIONS.some((extension) =>
    normalizedPath.endsWith(extension)
  );
};

module.exports = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100 MB
  UNSUPPORTED_FILE_EXTENSIONS,
  hasUnsupportedExtension,
  isDotfileOrDotfolder: shouldIgnoreFile,
};
