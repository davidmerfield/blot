const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");
const { resolve, join } = require("path");
const { promisify } = require("util");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));
const LRUCache = require("lru-cache").LRUCache;
const {
  GLOBAL_STATIC_DIR,
  GLOBAL_STATIC_SUBDIRECTORIES,
} = require("../../lib/staticPaths");

const pathCache = new LRUCache({
  max: 5000,
  maxSize: 2 * 1024 * 1024,
  sizeCalculation: (value) =>
    typeof value === "string" ? Math.max(1, value.length) : 16,
});

// create a set for global static files
const globalStaticFiles = new Set();

async function lookupFile(blogID, cacheID, value) {
  // strip any hash from the value, but keep it so we can
  // reattach it to whichever URL we end up returning
  const hashIndex = value.indexOf("#");
  const hash_ = hashIndex > -1 ? value.slice(hashIndex) : "";
  value = hashIndex > -1 ? value.slice(0, hashIndex) : value;

  // if the value contains url-encoded characters, decode it
  if (value.includes("%")) {
    try {
    value = decodeURIComponent(value);
    } catch (err) {
      // e.g. '100% luck.jpg' will throw an error
      // 'Uncaught URIError: malformed URI sequence'
      // in this case the value is left unchanged
    }
  }

  const [pathFromValue, ...rest] = value.split("?");
  const query = rest.length ? `?${rest.join("?")}` : "";

  // if the value is a static file, we need to resolve it
  if (GLOBAL_STATIC_SUBDIRECTORIES.some((dir) => value.startsWith(dir))) {
    const filePath = join(GLOBAL_STATIC_DIR, pathFromValue);
    try {
      // check  if the file exists in the global static files set
      if (globalStaticFiles.has(pathFromValue)) {
        return `${config.cdn.origin}${value}${hash_}`;
      }
      await fs.stat(filePath);
      // store the pathFromValue in set of valid static files
      // so we can use it later
      globalStaticFiles.add(pathFromValue);
      return `${config.cdn.origin}${value}${hash_}`;
    } catch (err) {}
  }

  const key = `${blogID}:${cacheID}:${pathFromValue}`;

  let result = pathCache.get(key);

  if (result === "ENOENT") {
    return "ENOENT";
  }

  if (!result) {
    try {
      // remove query string
      const blogFolder = join(config.blog_folder_dir, blogID);
      const { stat, path } = await getStat(
        blogFolder,
        resolve("/", pathFromValue)
      );

      const version = hash(`${stat.mtime}${stat.ctime}${stat.size}`).slice(0, 8);

      // we need to include the path in the result since if there is a case-sensitive
      // issue, the path will be different after resolution
      result = `v-${version}/${blogID}${path}`;

      pathCache.set(key, result);
    } catch (err) {
      pathCache.set(key, "ENOENT");
      return "ENOENT";
    }
  }

  return `${config.cdn.origin}/folder/${result}${query}${hash_}`;
}

async function getStat(blogFolder, path) {
  const filePath = join(blogFolder, path);

  let stat;

  try {
    stat = await fs.stat(filePath);
    return { stat, path };
  } catch (e) {}

  try {
    const resolvedPath = await caseSensitivePath(blogFolder, path);
    const resolvedRelativePath = resolvedPath.slice(blogFolder.length);
    stat = await fs.stat(resolvedPath);
    return { stat, path: resolvedRelativePath };
  } catch (e) {}

  throw new Error("File not found");
}

module.exports = lookupFile;
module.exports._clear = function () {
  pathCache.clear();
};
