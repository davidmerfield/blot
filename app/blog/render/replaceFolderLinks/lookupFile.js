const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");
const { resolve, join } = require("path");
const { promisify } = require("util");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));

class Cache {
  constructor() {
    this.cache = new Map();
    this.maxEntries = 1000;
  }

  set(key, value) {
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key) {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
}

const pathCache = new Cache();

async function lookupFile(blogID, cacheID, value) {
  const [pathFromValue, ...rest] = value.split("?");
  const query = rest.length ? `?${rest.join("?")}` : "";
  const key = hash(`${blogID}:${cacheID}:${pathFromValue}`);

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

      version = hash(`${stat.mtime}${stat.ctime}${stat.size}`).slice(0, 8);

      // we need to include the path in the result since if there is a case-sensitive
      // issue, the path will be different after resolution
      result = `v-${version}/${blogID}${path}`;
      
      pathCache.set(key, result);
    } catch (err) {
      pathCache.set(key, "ENOENT");
      return "ENOENT";
    }
  }

  return `${config.cdn.origin}/folder/${result}${query}`;
}

async function getStat(blogFolder, path) {
  const filePath = join(blogFolder, path);

  let stat;

  try {
    stat = await fs.stat(filePath);
    return { stat, path };
  } catch (e) {}

  try {
    resolvedPath = await caseSensitivePath(blogFolder, path);
    resolvedRelativePath = resolvedPath.slice(blogFolder.length);
    stat = await fs.stat(resolvedPath);
    return { stat, path: resolvedRelativePath };
  } catch (e) {}

  throw new Error("File not found");
}

module.exports = lookupFile;
