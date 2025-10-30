const { URL } = require("url");
const cheerio = require("cheerio");
const fs = require("fs-extra");

function extractMetadataFromHTML(html, href) {
  try {
    const $ = cheerio.load(html);

    const metadata = {
      title:
        extractMeta($, 'meta[property="og:title"]') ||
        extractMeta($, 'meta[name="twitter:title"]') ||
        $("title").first().text(),
      description:
        extractMeta($, 'meta[property="og:description"]') ||
        extractMeta($, 'meta[name="description"]') ||
        extractMeta($, 'meta[name="twitter:description"]'),
      image:
        extractMeta($, 'meta[property="og:image"]') ||
        extractMeta($, 'meta[name="twitter:image"]'),
      siteName: extractMeta($, 'meta[property="og:site_name"]'),
      icon: extractIcon($),
    };

    sanitizeMetadata(metadata, href);

    if (!metadata.title && !metadata.description && !metadata.image) {
      return null;
    }

    return metadata;
  } catch (err) {
    return null;
  }
}

function extractMeta($, selector) {
  const el = $(selector).first();
  if (!el || !el.length) return "";
  return el.attr("content") || "";
}

function fallbackMetadata(href) {
  try {
    const { hostname } = new URL(href);
    const display = hostname || href;
    return {
      url: href,
      title: display,
      description: "",
      image: "",
      siteName: display,
      icon: "",
      iconPath: "",
    };
  } catch (err) {
    return {
      url: href,
      title: href,
      description: "",
      image: "",
      siteName: href,
      icon: "",
      iconPath: "",
    };
  }
}

function sanitizeMetadata(metadata, href) {
  Object.keys(metadata).forEach((key) => {
    if (typeof metadata[key] === "string") {
      metadata[key] = metadata[key].trim();
    }
  });

  const remote = sanitizeRemoteImage(metadata, href);
  metadata.remoteImage = remote;

  const icon = sanitizeIcon(metadata, href);
  metadata.remoteIcon = icon;

  if (metadata.imageSet && Array.isArray(metadata.imageSet.items)) {
    metadata.imageSet.items = metadata.imageSet.items
      .map((item) => sanitizeImageSetItem(item))
      .filter(Boolean);
    metadata.imageSet.remote = remote;
  } else {
    metadata.imageSet = null;
  }

  if (metadata.imageSet && metadata.imageSet.items.length === 0) {
    metadata.imageSet = null;
  }

  metadata.iconPath = sanitizePath(metadata.iconPath);
}

function sanitizeRemoteImage(metadata, href) {
  const remoteSource = metadata.remoteImage || metadata.image;
  const remote = sanitizeRemoteURL(remoteSource, href);
  metadata.remoteImage = remote;

  if (metadata.image) {
    const sanitizedImage = sanitizeRemoteURL(metadata.image, href);
    metadata.image = sanitizedImage || metadata.image;
  } else {
    metadata.image = remote;
  }

  return remote;
}

function sanitizeIcon(metadata, href) {
  const remoteSource = metadata.remoteIcon || metadata.icon;
  const remote = sanitizeRemoteURL(remoteSource, href);
  metadata.remoteIcon = remote;

  if (metadata.icon) {
    const sanitizedIcon = sanitizeRemoteURL(metadata.icon, href);
    metadata.icon = sanitizedIcon || metadata.icon;
  } else {
    metadata.icon = remote;
  }

  return remote;
}

function sanitizeRemoteURL(value, href) {
  if (!value) return "";

  try {
    const url = new URL(value, href);
    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch (err) {
    return "";
  }
}

function sanitizeImageSetItem(item) {
  if (!item || typeof item !== "object") return null;

  const width = Number(item.width);
  if (!Number.isFinite(width) || width <= 0) return null;

  const sanitized = {
    width,
    height:
      item.height && Number.isFinite(Number(item.height))
        ? Number(item.height)
        : null,
    path: sanitizePath(item.path),
  };

  if (!sanitized.path) return null;

  return sanitized;
}

function sanitizePath(path) {
  if (!path || typeof path !== "string") return "";
  return path.replace(/\\+/g, "/").replace(/^\/+/, "").trim();
}

function extractIcon($) {
  const candidates = [];

  $("link[rel]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").toLowerCase();
    if (!rel || !/icon/.test(rel)) return;

    const href = $(el).attr("href") || $(el).attr("content") || "";
    if (!href) return;

    const sizesAttr = ($(el).attr("sizes") || "").toLowerCase();
    const score = scoreIconCandidate(sizesAttr, rel);

    candidates.push({ href, score });
  });

  if (candidates.length === 0) return "";

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0].href;
}

function scoreIconCandidate(sizesAttr, rel) {
  if (sizesAttr === "any") return Number.POSITIVE_INFINITY;

  const sizes = sizesAttr.split(/\s+/);
  let maxSize = 0;

  for (const size of sizes) {
    const match = size.match(/(\d+)x(\d+)/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      maxSize = Math.max(maxSize, width, height);
    }
  }

  if (!maxSize && rel.includes("apple-touch")) {
    maxSize = 180;
  }

  if (!maxSize && rel.includes("shortcut")) {
    maxSize = 64;
  }

  if (!maxSize) {
    maxSize = 16;
  }

  return maxSize;
}

function createHTMLTransform(href) {
  return function (path, callback) {
    fs.readFile(path, "utf8", (err, html) => {
      if (err) return callback(err);

      const metadata = extractMetadataFromHTML(html, href);
      if (!metadata) {
        return callback(new Error("No metadata"));
      }

      callback(null, metadata);
    });
  };
}

module.exports = {
  createHTMLTransform,
  extractMetadataFromHTML,
  fallbackMetadata,
  sanitizeMetadata,
  sanitizeRemoteImage,
  sanitizeIcon,
  sanitizeRemoteURL,
};
