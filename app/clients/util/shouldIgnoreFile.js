// Exact-match directory and file names (case-insensitive)
// These are checked against each path component recursively
const IGNORED_SYSTEM_FILES = new Set([
  // macOS system files
  ".ds_store",
  ".fseventsd",
  ".spotlight-v100",
  ".trashes",
  ".temporaryitems",
  // Windows system files
  "thumbs.db",
  "desktop.ini",
  "$recycle.bin",
  // Linux system files
  ".trash",
  // Version control directories (ignored recursively at any path level)
  ".git",
  ".svn",
  // Editor/IDE files
  ".kate-swp",
  // Application-specific
  ".tmp.driveupload",
  ".synologyworkingdirectory",
  ".sync",
  ".syncignore",
  // Cloud sync directories
  ".dropbox",
  ".dropbox.attr",
  ".dropbox.cache",
]);

// Suffix patterns (file extensions/endings)
const IGNORED_SUFFIXES = [
  ".tmp",
  "~", // Backup files ending with ~
  ".orig", // Merge conflict originals
  ".rej", // Merge conflict rejects
  ".swp", // Vim swap files
  ".swo", // Vim swap files (old)
];

// Prefix patterns
const IGNORED_PREFIXES = [
  ".#", // Emacs lockfiles (.#filename)
  "._", // AppleDouble resource forks
  ".trash-", // macOS trash variants
];

const shouldIgnoreFile = (inputPath) => {
  if (!inputPath) return false;

  const normalizedPath = String(inputPath).trim();
  if (!normalizedPath) return false;

  const components = normalizedPath.split(/[\\/]/);

  for (const rawComponent of components) {
    // Special case: macOS Icon file with carriage return (check before trimming)
    if (rawComponent === "Icon\r" || rawComponent.startsWith("Icon\r")) return true;

    const component = rawComponent.trim();
    if (!component || component === "." || component === "..") continue;

    // Office temporary files (e.g., ~$document.docx)
    if (component.startsWith("~$")) return true;

    const lowerComponent = component.normalize("NFC").toLowerCase();

    // Check exact matches (case-insensitive)
    if (IGNORED_SYSTEM_FILES.has(lowerComponent)) return true;

    // Check suffix patterns
    for (const suffix of IGNORED_SUFFIXES) {
      if (lowerComponent.endsWith(suffix)) return true;
    }

    // Check prefix patterns
    for (const prefix of IGNORED_PREFIXES) {
      if (lowerComponent.startsWith(prefix)) return true;
    }
  }

  return false;
};

module.exports = shouldIgnoreFile;
