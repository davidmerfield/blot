const IGNORED_SYSTEM_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".git",
]);

const shouldIgnoreFile = (inputPath) => {
  if (!inputPath) return false;

  const normalizedPath = String(inputPath).trim();
  if (!normalizedPath) return false;

  const components = normalizedPath.split(/[\\/]/);

  for (const rawComponent of components) {
    const component = rawComponent.trim();
    if (!component || component === "." || component === "..") continue;

    if (component.startsWith("~$")) return true;

    const lowerComponent = component.toLowerCase();
    if (IGNORED_SYSTEM_FILES.has(lowerComponent)) return true;
  }

  return false;
};

module.exports = shouldIgnoreFile;
