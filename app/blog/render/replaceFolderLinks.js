const cheerio = require("cheerio");
const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");

// Simple LRU-like cache with size limit
class Cache {
  constructor(maxBytes = 1024 * 1024) {
    // 1MB default
    this.cache = new Map();
    this.maxBytes = maxBytes;
    this.currentSize = 0;
  }

  set(key, value) {
    const valueSize = Buffer.from(value).length;

    // If single entry is too large, don't cache
    if (valueSize > this.maxBytes) return;

    // Remove oldest entries until we have space
    while (
      this.currentSize + valueSize > this.maxBytes &&
      this.cache.size > 0
    ) {
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey);
      this.currentSize -= Buffer.from(firstValue).length;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
    this.currentSize += valueSize;
  }

  get(key) {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recent)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
}

const pathCache = new Cache();

module.exports = async function replaceFolderLinks(cacheID, blogID, html) {
  try {
    const $ = cheerio.load(html, {
      decodeEntities: false,
    });

    const nodes = $('[href^="/"], [src^="/"]').filter(function () {
      const attr = $(this).attr("href") || $(this).attr("src");
      return !attr.endsWith(".html") && /\/[^/]*\.[^/]*$/.test(attr);
    });

    await Promise.all(
      nodes.map(async function (i, node) {
        const $node = $(node);
        const path = $node.attr("href") || $node.attr("src");

        // Create cache key combining cacheID and path
        const cacheKey = `${cacheID}:${path}`;
        const cachedResult = pathCache.get(cacheKey);

        if (cachedResult) {
          if ($node.attr("href")) $node.attr("href", cachedResult);
          if ($node.attr("src")) $node.attr("src", cachedResult);
          return;
        }

        try {
          const stat = await fs.stat(
            config.blog_folder_dir + "/" + blogID + path
          );
          const identifier = stat.mtime.toString() + stat.size.toString();
          const version = hash(identifier).slice(0, 8);
          const result = `${config.cdn.origin}/folder/v-${version}/${blogID}${path}`;

          // Cache the result
          pathCache.set(cacheKey, result);

          if ($node.attr("href")) $node.attr("href", result);
          if ($node.attr("src")) $node.attr("src", result);
        } catch (err) {
          console.warn(`File not found: ${path}`);
        }
      })
    );

    return $.html();
  } catch (err) {
    console.warn("Cheerio parsing failed:", err);
    return html;
  }
};
