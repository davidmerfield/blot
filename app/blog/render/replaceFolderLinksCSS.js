const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const config = require('config');
const fs = require('fs-extra');
const hash = require('helper/hash');
const { resolve, join } = require('path');

// Reuse the same Cache class and getVersion function from your HTML module
class Cache {
  constructor() {
    this.cache = new Map();
    this.maxEntries = 10000;
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

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

async function getVersion(blogID, cacheID, value) {
  const key = hash(`${blogID}:${cacheID}:${value}`);
  const [pathFromValue, ...rest] = value.split('?');
  const query = rest.length ? `?${rest.join('?')}` : '';
  const path = join(blogID, pathFromValue);

  let version = pathCache.get(key);

  if (!version) {
    try {
      const blogFolder = join(config.blog_folder_dir, blogID);
      const filePath = resolve(join(config.blog_folder_dir, path));

      if (!filePath.startsWith(blogFolder)) {
        throw new Error('Path is outside of blog folder' + filePath);
      }

      const stat = await fs.stat(filePath);
      version = hash(`${stat.mtime}${stat.size}`).slice(0, 8);
      pathCache.set(key, version);
    } catch (err) {
      console.log(key, `File not found: ${value}`, err);
      pathCache.set(key, 'ENOENT');
      return 'ENOENT';
    }
  }

  return `${config.cdn.origin}/folder/v-${version}/${path}${query}`;
}

// Main function to replace URLs in CSS
module.exports = async function replaceCssUrls(cacheID, blogID, css) {
  try {
    const promises = [];
    let changes = 0;

    // Process the CSS using PostCSS
    const result = await postcss([
      {
        postcssPlugin: 'replace-urls',
        Declaration(decl) {
          // Only process properties that might contain URLs
          if (!/url\(/i.test(decl.value)) return;

          const parsed = valueParser(decl.value);

          parsed.walk(node => {
            if (node.type === 'function' && node.value.toLowerCase() === 'url') {
              const url = node.nodes[0]?.value;
              if (!url) return;

              // Remove quotes if present
              const cleanUrl = url.replace(/['"]/g, '');

              // Skip if it's an absolute URL or data URL
              if (cleanUrl.includes('://') || cleanUrl.startsWith('data:')) {
                return;
              }

              // Skip HTML files and check if it's a valid file
              if (htmlExtRegex.test(cleanUrl) || !fileExtRegex.test(cleanUrl)) {
                return;
              }

              promises.push(
                (async () => {
                  const result = await getVersion(blogID, cacheID, cleanUrl);

                  if (result === 'ENOENT') {
                    console.log(`File not found: ${cleanUrl}`);
                    return;
                  }

                  console.log(`Replacing ${cleanUrl} with ${result}`);
                  node.nodes[0].value = result;
                  changes++;
                })()
              );
            }
          });

          // Update the declaration value with transformed URLs
          decl.value = parsed.toString();
        }
      }
    ]).process(css);

    await Promise.all(promises);
    return changes ? result.css : css;

  } catch (err) {
    console.warn('PostCSS parsing failed:', err);
    return css;
  }
};