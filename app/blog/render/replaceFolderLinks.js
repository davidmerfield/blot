const parse5 = require("parse5");
const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");
const { at } = require("lodash");

class Cache {
  constructor(maxBytes = 1024 * 1024) {
    this.cache = new Map();
    this.maxBytes = maxBytes;
    this.currentSize = 0;
  }

  set(key, value) {
    const valueSize = Buffer.from(value).length;
    if (valueSize > this.maxBytes) return;

    if (this.currentSize + valueSize > this.maxBytes) {
      const entriesToDelete = [];
      let bytesToFree = this.currentSize + valueSize - this.maxBytes;

      for (const [key, val] of this.cache) {
        bytesToFree -= Buffer.from(val).length;
        entriesToDelete.push(key);
        if (bytesToFree <= 0) break;
      }

      for (const key of entriesToDelete) {
        const val = this.cache.get(key);
        this.currentSize -= Buffer.from(val).length;
        this.cache.delete(key);
      }
    }

    this.cache.set(key, value);
    this.currentSize += valueSize;
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

const htmlExtRegex = /\.html$/;
const fileExtRegex = /\/[^/]*\.[^/]*$/;

module.exports = async function replaceFolderLinks(cacheID, blogID, html) {
  try {
    const fragment = parse5.parseFragment(html);
    
    const elements = [];
    const promises = [];
    
    const stack = [fragment];

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
          const cacheKey = `${cacheID}:${attr.value}`;
          const cachedResult = pathCache.get(cacheKey);

          if (cachedResult) {
            // we have cached a missing file
            if (cachedResult === attr.value) {
              continue;
            }
            attr.value = cachedResult;
            changes++;
            continue;
          }

          promises.push(
            (async () => {
              try {
                const stat = await fs.stat(
                  config.blog_folder_dir + "/" + blogID + attr.value
                );
                const identifier = stat.mtime.toString() + stat.size.toString();
                const version = hash(identifier).slice(0, 8);
                const result = `${config.cdn.origin}/folder/v-${version}/${blogID}${attr.value}`;
                pathCache.set(cacheKey, result);
                attr.value = result;
                changes++;
              } catch (err) {
                console.warn(`File not found: ${attr.value}`, err);
                pathCache.set(cacheKey, attr.value);
              } 
            })()
          );
        }
      }
    }

    await Promise.all(promises);
    return promises.length > 0 ? parse5.serialize(fragment) : html;
  } catch (err) {
    console.warn("Parse5 parsing failed:", err);
    return html;
  }
};
