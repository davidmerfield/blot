const parse5 = require('parse5');
const config = require("config");
const fs = require("fs-extra");
const hash = require("helper/hash");

class Cache {
  constructor(maxBytes = 1024 * 1024) {
    this.cache = new Map();
    this.maxBytes = maxBytes;
    this.currentSize = 0;
  }

  set(key, value) {
    const valueSize = Buffer.from(value).length;
    if (valueSize > this.maxBytes) return;
    while (this.currentSize + valueSize > this.maxBytes && this.cache.size > 0) {
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
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
}

const pathCache = new Cache();

module.exports = async function replaceFolderLinks(cacheID, blogID, html) {
  try {
    const fragment = parse5.parseFragment(html);
    
    async function processNode(node) {
      if (!node.attrs) return;
      
      for (const attr of node.attrs) {
        if ((attr.name === 'href' || attr.name === 'src') && 
            attr.value.startsWith('/') && 
            !attr.value.endsWith('.html') && 
            /\/[^/]*\.[^/]*$/.test(attr.value)) {
          
          const cacheKey = `${cacheID}:${attr.value}`;
          const cachedResult = pathCache.get(cacheKey);

          if (cachedResult) {
            attr.value = cachedResult;
            continue;
          }

          try {
            const stat = await fs.stat(config.blog_folder_dir + "/" + blogID + attr.value);
            const identifier = stat.mtime.toString() + stat.size.toString();
            const version = hash(identifier).slice(0, 8);
            const result = `${config.cdn.origin}/folder/v-${version}/${blogID}${attr.value}`;
            
            pathCache.set(cacheKey, result);
            attr.value = result;
          } catch (err) {
            console.warn(`File not found: ${attr.value}`);
          }
        }
      }

      if (node.childNodes) {
        await Promise.all(node.childNodes.map(processNode));
      }
    }

    await processNode(fragment);
    return parse5.serializeFragment(fragment);
  } catch (err) {
    console.warn('Parse5 parsing failed:', err);
    return html;
  }
};