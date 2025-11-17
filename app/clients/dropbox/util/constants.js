const UNSUPPORTED_FILE_EXTENSIONS = [".paper"];

const hasUnsupportedExtension = (filePath = "") => {
  const normalizedPath = String(filePath).toLowerCase();
  return UNSUPPORTED_FILE_EXTENSIONS.some((extension) =>
    normalizedPath.endsWith(extension)
  );
};

const isDotfileOrDotfolder = (path) => {
  if (!path) return false;
  const normalizedPath = String(path).trim();
  if (!normalizedPath) return false;

  const components = normalizedPath.split(/[\\/]/);
  return components.some((component) => {
    return component.startsWith(".") && component !== "." && component !== "..";
  });
};

module.exports = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100 MB
  UNSUPPORTED_FILE_EXTENSIONS,
  hasUnsupportedExtension,
  isDotfileOrDotfolder,
};
