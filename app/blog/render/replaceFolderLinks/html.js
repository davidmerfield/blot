const parse5 = require("parse5");
const LRUCache = require("lru-cache").LRUCache;
const hash = require("helper/hash");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

const lookupFile = require("./lookupFile");
const blogHosts = require("../../lib/blogHosts");
const yieldToEventLoop = require("../../lib/yieldToEventLoop");

const rewrittenHtmlCache = new LRUCache({
  max: 500,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) =>
    typeof value === "string" ? Math.max(1, value.length) : 1,
});
const rewrittenHtmlInflight = new Map();

// Conservative: false positives still parse; missing a rewrite candidate
// would skip needed CDN rewrites. Require an href/src/poster/srcset whose
// value looks like a non-html file path.
const FOLDER_FILE_ATTR =
  /(?:href|src|poster|srcset)\s*=\s*(["']?)[^"'>]*\.(?!html(?:["'#?\s>]|$))[a-zA-Z0-9]+/i;

function mightContainFolderFiles(html) {
  if (!html) return false;
  if (
    html.indexOf("href") === -1 &&
    html.indexOf("src") === -1 &&
    html.indexOf("poster") === -1 &&
    html.indexOf("srcset") === -1
  ) {
    return false;
  }
  return FOLDER_FILE_ATTR.test(html);
}

function rewriteCacheKey(blogID, cacheID, html) {
  return `${blogID}:${cacheID}:${hash(html)}`;
}

const parseSrcset = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const candidates = value.split(",");
  const parsed = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split(/\s+/);
    const url = parts.shift();
    if (!url) {
      return null;
    }

    parsed.push({
      url,
      descriptor: parts.length ? parts.join(" ") : "",
    });
  }

  return parsed;
};

async function rewriteFolderLinks(blog, html, log) {
  try {
    const blogID = blog.id;
    const cacheID = blog.cacheID;
    const hosts = blogHosts(blog);

    // Create regex patterns for each host
    const hostPatterns = hosts.map(
      (host) => new RegExp(`^(?:https?:)?//${host}`)
    );

    if (typeof html === "string" && html.length > 16384) {
      await yieldToEventLoop();
    }

    const document = parse5.parse(html);
    const elements = [];
    const promises = [];
    const stack = [...document.childNodes];
    let changes = 0;

    while (stack.length > 0) {
      const node = stack.pop();

      if (node.attrs) {
        let hasMatchingAttr = false;
        for (let i = 0; i < node.attrs.length; i++) {
          const attr = node.attrs[i];
          if (attr.name === "href" || attr.name === "src" || attr.name === "poster") {

            // Ensure attr.value is a string
            if (typeof attr.value !== "string") {
              continue;
            }

            // Skip data URLs
            if (attr.value.startsWith("data:")) {
              continue;
            }

            // Check if URL is relative or matches any of the host patterns
            const isRelative = attr.value.indexOf("://") === -1;
            const matchesHost = hostPatterns.some(pattern => pattern.test(attr.value));
            
            if (isRelative || matchesHost) {
              hasMatchingAttr = true;
              break;
            }
          }

          if (attr.name === "srcset") {
            const candidates = parseSrcset(attr.value);
            if (!candidates) {
              continue;
            }

            const hasRelative = candidates.some((candidate) => {
              if (!candidate.url || candidate.url.startsWith("data:")) {
                return false;
              }
              const isRelative = candidate.url.indexOf("://") === -1;
              const matchesHost = hostPatterns.some(pattern => pattern.test(candidate.url));
              return isRelative || matchesHost;
            });

            if (hasRelative) {
              hasMatchingAttr = true;
              break;
            }
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
        if (attr.name === "href" || attr.name === "src" || attr.name === "poster") {
          let value = attr.value;
            
          // Remove host if it matches any of the patterns
          hostPatterns.forEach(pattern => {
            value = value.replace(pattern, '');
          });

          // Only process if it's not an HTML file and has a file extension
          if (!htmlExtRegex.test(value) && fileExtRegex.test(value)) {
            promises.push(
              (async () => {
                const result = await lookupFile(blogID, cacheID, value);

                if (result === "ENOENT") {
                  log(`No file found in folder: ${value}`);
                  return;
                }

                log(`Replacing ${attr.value} with ${result}`);
                attr.value = result;
                changes++;
              })()
            );
          }
        }

        if (attr.name === "srcset") {
          const candidates = parseSrcset(attr.value);
          if (!candidates) {
            continue;
          }

          promises.push(
            (async () => {
              const rebuilt = [];

              for (const candidate of candidates) {
                const originalUrl = candidate.url;

                if (!originalUrl || originalUrl.startsWith("data:")) {
                  rebuilt.push(
                    candidate.descriptor
                      ? `${originalUrl} ${candidate.descriptor}`
                      : originalUrl
                  );
                  continue;
                }

                const isRelative = originalUrl.indexOf("://") === -1;
                const matchesHost = hostPatterns.some((pattern) =>
                  pattern.test(originalUrl)
                );

                let rewrittenUrl = originalUrl;
                let lookupPath = originalUrl;

                if (matchesHost) {
                  hostPatterns.forEach((pattern) => {
                    lookupPath = lookupPath.replace(pattern, "");
                  });
                }

                if (isRelative || matchesHost) {
                  if (!htmlExtRegex.test(lookupPath) && fileExtRegex.test(lookupPath)) {
                    const result = await lookupFile(blogID, cacheID, lookupPath);

                    if (result === "ENOENT") {
                      log(`No file found in folder: ${lookupPath}`);
                      rewrittenUrl = originalUrl;
                    } else {
                      log(`Replacing ${originalUrl} with ${result}`);
                      rewrittenUrl = result;
                      changes++;
                    }
                  } else {
                    rewrittenUrl = originalUrl;
                  }
                } else {
                  rewrittenUrl = originalUrl;
                }

                rebuilt.push(
                  candidate.descriptor
                    ? `${rewrittenUrl} ${candidate.descriptor}`
                    : rewrittenUrl
                );
              }

              attr.value = rebuilt.join(", ");
            })()
          );
        }
      }
    }

    await Promise.all(promises);
    return changes ? parse5.serialize(document) : html;
  } catch (err) {
    console.warn("Parse5 parsing failed:", err);
    return html;
  }
}

module.exports = async function replaceFolderLinks(blog, html, log = () => {}) {
  if (!blog || typeof html !== "string") return html;
  if (!mightContainFolderFiles(html)) return html;

  const key = rewriteCacheKey(blog.id, blog.cacheID, html);
  if (rewrittenHtmlCache.has(key)) {
    log("Reused rewritten HTML");
    return rewrittenHtmlCache.get(key);
  }

  if (rewrittenHtmlInflight.has(key)) {
    return rewrittenHtmlInflight.get(key);
  }

  const pending = rewriteFolderLinks(blog, html, log).then((output) => {
    rewrittenHtmlCache.set(key, output);
    return output;
  });

  rewrittenHtmlInflight.set(key, pending);
  try {
    return await pending;
  } finally {
    rewrittenHtmlInflight.delete(key);
  }
};

module.exports._clear = function () {
  rewrittenHtmlCache.clear();
  rewrittenHtmlInflight.clear();
};

module.exports._mightContainFolderFiles = mightContainFolderFiles;
