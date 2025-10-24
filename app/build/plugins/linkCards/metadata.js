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
    };
  } catch (err) {
    return {
      url: href,
      title: href,
      description: "",
      image: "",
      siteName: href,
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
}

function sanitizeRemoteImage(metadata, href) {
  if (!metadata.image) return "";

  try {
    const url = new URL(metadata.image, href);
    if (!/^https?:$/i.test(url.protocol)) {
      metadata.image = "";
      return "";
    }
    metadata.image = url.toString();
    return metadata.image;
  } catch (err) {
    metadata.image = "";
    return "";
  }
}

function sanitizeImageSetItem(item) {
  if (!item || typeof item !== "object") return null;

  const width = Number(item.width);
  if (!Number.isFinite(width) || width <= 0) return null;

  const sanitized = {
    width,
    height: item.height && Number.isFinite(Number(item.height))
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
};
