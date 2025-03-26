const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");
const { resolve, join } = require("path");
const Cache = require("./cache");
const pathCache = new Cache();

async function getVersion(blogID, cacheID, value) {
  const key = hash(`${blogID}:${cacheID}:${value}`);
  const [pathFromValue, ...rest] = value.split("?");
  const query = rest.length ? `?${rest.join("?")}` : "";
  const path = join(blogID, pathFromValue);

  let version = pathCache.get(key);

  if (version === "ENOENT") {
    return "ENOENT";
  }

  if (!version) {
    try {
      // remove query string
      const blogFolder = join(config.blog_folder_dir, blogID);
      const filePath = resolve(join(config.blog_folder_dir, path));

      // check the file path is within the blog folder
      if (!filePath.startsWith(blogFolder)) {
        throw new Error("Path is outside of blog folder" + filePath);
      }

      const stat = await fs.stat(filePath);
      version = hash(`${stat.mtime}${stat.size}`).slice(0, 8);
      pathCache.set(key, version);
    } catch (err) {
      console.log(key, `File not found: ${value}`, err);
      pathCache.set(key, "ENOENT");
      return "ENOENT";
    }
  }

  return `${config.cdn.origin}/folder/v-${version}/${path}${query}`;
}

module.exports = getVersion;
