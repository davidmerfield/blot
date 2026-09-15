const config = require("config");
const lookupFile = require("blog/render/replaceFolderLinks/lookupFile");
const blogHosts = require("blog/lib/blogHosts");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

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

function hostPatternsFor(options) {
  const hosts = blogHosts({
    handle: options.handle,
    domain: options.domain,
  });
  return hosts.map((host) => new RegExp(`^(?:https?:)?//${host}`));
}

const IMAGE_EXT =
  /\.(?:gif|jpe?g|png|webp|svg|avif|heic|heif|bmp|tiff?)$/i;

function shouldLookup(value, hostPatterns) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("#") || value.startsWith("data:")) return false;
  if (config.cdn && config.cdn.origin && value.indexOf(config.cdn.origin) === 0) {
    return false;
  }
  if (
    value.startsWith("/_image_cache/") ||
    value.startsWith("/_assets/") ||
    value.startsWith("/_thumbnails/")
  ) {
    return false;
  }

  const isRelative = value.indexOf("://") === -1 && !value.startsWith("//");
  const matchesHost = hostPatterns.some((pattern) => pattern.test(value));
  if (!isRelative && !matchesHost) return false;

  let path = lookupPath(value, hostPatterns);
  path = path.split("#")[0].split("?")[0];
  if (!path || path === "/") return false;
  // Images go through the image-cache plugin; this plugin handles other
  // folder files (pdf, video, fonts) so stored HTML still matches that split.
  if (IMAGE_EXT.test(path)) return false;

  return !htmlExtRegex.test(path) && fileExtRegex.test(path);
}

function lookupPath(value, hostPatterns) {
  let path = value;
  hostPatterns.forEach((pattern) => {
    path = path.replace(pattern, "");
  });
  return path;
}

async function rewriteValue(value, options, hostPatterns) {
  if (!shouldLookup(value, hostPatterns)) return value;

  const path = lookupPath(value, hostPatterns);
  const result = await lookupFile(
    options.blogID,
    options.cacheID,
    path
  );

  if (result === "ENOENT") return value;
  return result;
}

function render($, callback, options) {
  if (!options || !options.blogID) return callback();

  const hostPatterns = hostPatternsFor(options);
  const nodes = $("[href], [src], [poster], [srcset]").toArray();

  (async () => {
    for (const node of nodes) {
      const $el = $(node);

      for (const attr of ["href", "src", "poster"]) {
        const current = $el.attr(attr);
        if (current === undefined) continue;
        const next = await rewriteValue(current, options, hostPatterns);
        if (next !== current) $el.attr(attr, next);
      }

      const srcset = $el.attr("srcset");
      if (!srcset) continue;

      const candidates = parseSrcset(srcset);
      if (!candidates) continue;

      const rebuilt = [];
      for (const candidate of candidates) {
        const next = await rewriteValue(candidate.url, options, hostPatterns);
        rebuilt.push(
          candidate.descriptor ? `${next} ${candidate.descriptor}` : next
        );
      }
      $el.attr("srcset", rebuilt.join(", "));
    }

    callback();
  })().catch(() => callback());
}

module.exports = {
  render: render,
  isDefault: true,
  category: "images",
  title: "Folder assets",
  description:
    "Rewrite file links in posts to versioned CDN URLs at build time",
};
