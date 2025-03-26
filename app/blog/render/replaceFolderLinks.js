const parse5 = require("parse5");
const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");

class Cache {
  constructor() {
    this.cache = new Map();
    this.maxEntries = 10000; // roughly 1MB of data
  }

  set(key, value) {
    if (this.cache.size >= this.maxEntries) {
      // Delete oldest entry (first item in map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key) {
    const value = this.cache.get(key);
    if (value) {
      // Move to end by deleting and re-adding
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
}

const pathCache = new Cache();

const htmlExtRegex = /\.html$/;
const fileExtRegex = /\/[^/]*\.[^/]*$/;

async function getVersion(blogID, cacheID, value) {
  const cacheKey = hash(`${blogID}:${cacheID}:${value}`);
  const cachedVersion = pathCache.get(cacheKey);

  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const filePath = `${config.blog_folder_dir}/${blogID}${value}`;
    const stat = await fs.stat(filePath);
    const version = hash(`${stat.mtime}${stat.size}`).slice(0, 8);
    pathCache.set(cacheKey, version);
    return version;
  } catch (err) {
    console.log(cacheKey, `File not found: ${value}`, err);
    pathCache.set(cacheKey, "ENOENT");
    return "ENOENT";
  }
}

module.exports = async function replaceFolderLinks(cacheID, blogID, html) {
  try {
    // Changed from parseFragment to parse for full HTML document
    const document = parse5.parse(html);

    const elements = [];
    const promises = [];

    // Start with document.childNodes instead of the document itself
    const stack = [...document.childNodes];

    let changes = 0;

    while (stack.length > 0) {
      const node = stack.pop();

      if (node.attrs) {
        let hasMatchingAttr = false;
        for (let i = 0; i < node.attrs.length; i++) {
          const attr = node.attrs[i];
          if (
            (attr.name === "href" || attr.name === "src") &&
            attr.value[0] === "/"
          ) {
            hasMatchingAttr = true;
            break;
          }
        }
        if (hasMatchingAttr) elements.push(node);
      }

      if (node.childNodes) {
        stack.push(...node.childNodes);
      }
    }

    for (const node of elements) {
      for (const attr of node.attrs) {
        if (
          (attr.name === "href" || attr.name === "src") &&
          attr.value[0] === "/" &&
          !htmlExtRegex.test(attr.value) &&
          fileExtRegex.test(attr.value)
        ) {
          promises.push(
            (async () => {
              const version = await getVersion(blogID, cacheID, attr.value);

              if (version === "ENOENT") {
                console.log(`File not found: ${attr.value}`);
                return;
              }

              const result = `${config.cdn.origin}/folder/v-${version}/${blogID}${attr.value}`;
              console.log(`Replacing ${attr.value} with ${result}`);
              attr.value = result;
              changes++;
            })()
          );
        }
      }
    }

    await Promise.all(promises);
    // Use serialize on the full document
    return changes ? parse5.serialize(document) : html;
  } catch (err) {
    console.warn("Parse5 parsing failed:", err);
    return html;
  }
};
