const { URL } = require("url");
const crypto = require("crypto");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const sharp = require("sharp");
const { join, dirname } = require("path");
const Transformer = require("helper/transformer");
const TransformerKeys = require("helper/transformer/keys");
const client = require("models/client");
const config = require("config");
const he = require("he");

const CACHE_DIRECTORY = "_link_cards";
const THUMBNAIL_DIRECTORY = "link_cards";
const THUMBNAIL_WIDTHS = [240, 480, 960];
const DEFAULT_LAYOUT = "compact";
const VALID_LAYOUTS = new Set(["compact", "large"]);
const REQUEST_TIMEOUT = 10000;

sharp.cache(false);

function render($, callback, options = {}) {
  const layout = normalizeLayout(options.layout);
  const elements = [];
  const htmlTransformer = createTransformer(
    options.blogID,
    "link-cards"
  );
  const imageTransformer = createTransformer(
    options.blogID,
    "link-cards-thumbnails"
  );

  $("a").each((_, el) => {
    if (shouldTransform($, el, options)) {
      elements.push(el);
    }
  });

  (async () => {
    for (const el of elements) {
      const href = $(el).attr("href");

      try {
        const metadata = await loadMetadata(href, options.blogID, {
          html: htmlTransformer,
          image: imageTransformer,
        });
        if (!metadata) continue;

        const cardHTML = buildCardHTML(href, metadata, layout);
        replaceWithCard($, el, cardHTML);
      } catch (err) {
        // Ignore errors so other content can continue rendering
      }
    }
  })()
    .then(() => callback())
    .catch(() => callback());
}

async function loadMetadata(href, blogID, transformers = {}) {
  if (!href) return null;

  const cachePath = getCachePath(blogID, href);

  const cached = await readCache(cachePath);
  if (cached) {
    sanitizeMetadata(cached, href);
    cached.url = href;
    await ensureThumbnails(cached, blogID, transformers.image);
    await writeCache(cachePath, cached);
    return cached;
  }

  const fetched = await fetchMetadata(href, transformers.html);
  if (fetched) {
    sanitizeMetadata(fetched, href);
    fetched.url = href;
    await ensureThumbnails(fetched, blogID, transformers.image);
    await writeCache(cachePath, fetched);
    return fetched;
  }

  const fallback = fallbackMetadata(href);
  if (fallback) return fallback;

  return null;
}

async function fetchMetadata(href, transformer) {
  const fallback = () => fetchMetadataDirect(href);

  if (!transformer) {
    return fallback();
  }

  return transformerLookup(
    transformer,
    href,
    createHTMLTransform(href),
    fallback
  );
}

async function fetchMetadataDirect(href) {
  try {
    const response = await fetch(href, {
      redirect: "follow",
      timeout: REQUEST_TIMEOUT,
      headers: {
        "user-agent": "Blot Link Cards (+https://blot.im)",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractMetadataFromHTML(html, href);
  } catch (err) {
    return null;
  }
}

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

function transformerLookup(transformer, src, transformFactory, fallback) {
  return new Promise((resolve) => {
    const handleFallback = () => {
      if (!fallback) return resolve(null);
      Promise.resolve()
        .then(() => fallback())
        .then((result) => resolve(result || null))
        .catch(() => resolve(null));
    };

    if (!transformer) {
      return handleFallback();
    }

    try {
      transformer.lookup(src, transformFactory, async (err, result) => {
        if (!err && result) {
          return resolve(result);
        }

        const cached = await readTransformerResult(transformer, src);
        if (cached) {
          return resolve(cached);
        }

        handleFallback();
      });
    } catch (err) {
      readTransformerResult(transformer, src)
        .then((cached) => {
          if (cached) return resolve(cached);
          handleFallback();
        })
        .catch(() => handleFallback());
    }
  });
}

function readTransformerResult(transformer, src) {
  return new Promise((resolve) => {
    if (!transformer || !transformer._blogID || !transformer._name) {
      return resolve(null);
    }

    let keys;

    try {
      keys = TransformerKeys(transformer._blogID, transformer._name);
    } catch (err) {
      return resolve(null);
    }

    const urlContentKey = keys.url.content(src);

    client.get(urlContentKey, (err, hash) => {
      if (err || !hash) return resolve(null);

      client.get(keys.content(hash), (contentErr, payload) => {
        if (contentErr || !payload) return resolve(null);

        try {
          const parsed = JSON.parse(payload);
          resolve(parsed || null);
        } catch (parseErr) {
          resolve(null);
        }
      });
    });
  });
}

function createTransformer(blogID, name) {
  if (!blogID || !name) return null;

  try {
    const transformer = new Transformer(blogID, name);
    transformer._blogID = blogID;
    transformer._name = name;
    return transformer;
  } catch (err) {
    return null;
  }
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

function buildCardHTML(href, metadata, layout) {
  const safeHref = escapeAttribute(href);
  const pieces = [];

  const imageMarkup = buildImageMarkup(metadata, layout);
  if (imageMarkup) {
    pieces.push(`<div class="link-card__thumbnail">${imageMarkup}</div>`);
  }

  const title = metadata.title || metadata.siteName || href;
  const description = metadata.description || "";
  const displayURL = metadata.siteName || formatDisplayURL(href);

  const text = [];

  if (title) {
    text.push(`<h3 class="link-card__title">${escapeHTML(title)}</h3>`);
  }

  if (description) {
    text.push(
      `<p class="link-card__description">${escapeHTML(description)}</p>`
    );
  }

  text.push(`<span class="link-card__url">${escapeHTML(displayURL)}</span>`);

  pieces.push(`<div class="link-card__content">${text.join("")}</div>`);

  const anchor = `<a class="link-card__anchor" href="${safeHref}" rel="noopener noreferrer">${pieces.join(
    ""
  )}</a>`;

  return `<article class="link-card link-card--${layout}">${anchor}</article>`;
}

function replaceWithCard($, el, html) {
  const parent = $(el).parent();
  const text = textContent($(el).text());

  if (
    parent.length &&
    parent[0].name === "p" &&
    textContent(parent.text()) === text
  ) {
    parent.replaceWith(html);
  } else {
    $(el).replaceWith(html);
  }
}

function shouldTransform($, el, options) {
  const href = $(el).attr("href");
  const text = $(el).text();

  if (!href || !text) return false;
  if ($(el).children().length) return false;

  const normalizedHref = textContent(href);
  const normalizedText = textContent(text);

  if (normalizedHref !== normalizedText) return false;

  if (!/^https?:\/\//i.test(href)) return false;
  if (!isExternal(href, options)) return false;

  const parent = $(el).parent();
  if (
    parent.length &&
    parent[0].name === "p" &&
    textContent(parent.text()) !== normalizedText
  ) {
    return false;
  }

  return true;
}

function isExternal(href, options) {
  try {
    const url = new URL(href);
    if (!url.hostname) return false;

    const ignored = new Set();

    if (options.domain) {
      try {
        ignored.add(new URL(options.domain).hostname || options.domain);
      } catch (err) {
        ignored.add(options.domain);
      }
    }

    if (options.baseURL) {
      try {
        ignored.add(new URL(options.baseURL).hostname);
      } catch (err) {}
    }

    return !ignored.has(url.hostname);
  } catch (err) {
    return false;
  }
}

function getCachePath(blogID, href) {
  if (!blogID) return null;
  try {
    const hash = crypto.createHash("sha1").update(href).digest("hex");
    return join(
      config.blog_static_files_dir,
      blogID,
      CACHE_DIRECTORY,
      `${hash}.json`
    );
  } catch (err) {
    return null;
  }
}

async function readCache(path) {
  if (!path) return null;
  try {
    return await fs.readJson(path);
  } catch (err) {
    return null;
  }
}

async function writeCache(path, metadata) {
  if (!path || !metadata) return;

  try {
    await fs.ensureDir(dirname(path));
  } catch (err) {
    return;
  }

  try {
    await fs.writeJson(path, metadata);
  } catch (err) {}
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

  if (!metadata.imageSet) {
    metadata.image = remote;
  }

  if (!metadata.siteName) {
    metadata.siteName = formatDisplayURL(href);
  }
}

function sanitizeRemoteImage(metadata, href) {
  const candidate = metadata.remoteImage || metadata.image || "";

  if (!candidate) return "";

  try {
    const resolved = new URL(candidate, href);
    if (isSafeImageScheme(resolved.protocol)) {
      return resolved.toString();
    }
    return "";
  } catch (err) {
    return "";
  }
}

function sanitizeImageSetItem(item) {
  if (!item || typeof item !== "object") return null;

  const width = Number(item.width);
  const height = item.height ? Number(item.height) : null;
  const path = typeof item.path === "string" ? item.path.trim().replace(/^\//, "") : "";

  if (!path || !Number.isFinite(width) || width <= 0) return null;

  return {
    width,
    height: Number.isFinite(height) && height > 0 ? height : null,
    path,
  };
}

function isSafeImageScheme(protocol) {
  if (!protocol) return false;
  const normalized = protocol.toLowerCase();
  return normalized === "http:" || normalized === "https:";
}

function extractMeta($, selector) {
  const node = $(selector).first();
  if (!node.length) return "";
  return node.attr("content") || node.attr("value") || "";
}

function normalizeLayout(layout) {
  if (typeof layout === "string" && VALID_LAYOUTS.has(layout)) {
    return layout;
  }
  return DEFAULT_LAYOUT;
}

function escapeAttribute(value) {
  return he.encode(value || "", { useNamedReferences: true });
}

function escapeHTML(value) {
  return he.encode(value || "", { useNamedReferences: true });
}

function textContent(value) {
  return (value || "").trim();
}

function formatDisplayURL(href) {
  try {
    const url = new URL(href);
    const pathname = url.pathname && url.pathname !== "/" ? url.pathname : "";
    const search = url.search && url.search !== "?" ? url.search : "";
    return `${url.hostname}${pathname}${search}`;
  } catch (err) {
    return href;
  }
}

function buildImageMarkup(metadata, layout) {
  const imageSet = metadata.imageSet;
  const src = metadata.image;

  if (!src) return "";

  const attrs = [`src="${escapeAttribute(src)}"`, 'alt=""', 'loading="lazy"'];

  if (imageSet && imageSet.srcset) {
    attrs.push(`srcset="${escapeAttribute(imageSet.srcset)}"`);
    const sizes = layout === "large" ? "(max-width: 600px) 100vw, 600px" : "(max-width: 600px) 100vw, 96px";
    attrs.push(`sizes="${escapeAttribute(sizes)}"`);
  }

  return `<img ${attrs.join(" ")}>`;
}

async function ensureThumbnails(metadata, blogID, transformer) {
  if (!blogID) {
    metadata.imageSet = null;
    metadata.image = metadata.remoteImage;
    return;
  }

  const remoteImage = metadata.remoteImage;
  if (!remoteImage) {
    await cleanupThumbnails(metadata.imageSet, blogID);
    metadata.imageSet = null;
    metadata.image = "";
    return;
  }

  if (
    metadata.imageSet &&
    metadata.imageSet.remote === remoteImage &&
    (await thumbnailsExist(metadata.imageSet, blogID))
  ) {
    applyPublicImagePaths(metadata, blogID);
    return;
  }

  await cleanupThumbnails(metadata.imageSet, blogID);

  const generated = await lookupThumbnails(remoteImage, blogID, transformer);

  if (!generated) {
    metadata.imageSet = null;
    metadata.image = remoteImage;
    return;
  }

  metadata.imageSet = generated;
  applyPublicImagePaths(metadata, blogID);
}

function applyPublicImagePaths(metadata, blogID) {
  const imageSet = metadata.imageSet;
  if (!imageSet || !Array.isArray(imageSet.items) || imageSet.items.length === 0) {
    metadata.imageSet = null;
    metadata.image = metadata.remoteImage;
    return;
  }

  const items = imageSet.items
    .map((item) => Object.assign({}, item, {
      src: `${config.cdn.origin}/${blogID}/${item.path}`,
    }))
    .sort((a, b) => a.width - b.width);

  const src = items[items.length - 1].src;
  const srcset = items.map((item) => `${item.src} ${item.width}w`).join(", ");

  metadata.imageSet = Object.assign({}, imageSet, {
    items,
    src,
    srcset,
  });
  metadata.image = src;
}

async function thumbnailsExist(imageSet, blogID) {
  if (!imageSet || !Array.isArray(imageSet.items)) return false;

  const checks = await Promise.all(
    imageSet.items.map((item) => {
      const absolute = join(
        config.blog_static_files_dir,
        blogID,
        item.path
      );
      return fs.pathExists(absolute);
    })
  );

  return checks.every(Boolean);
}

async function cleanupThumbnails(imageSet, blogID) {
  if (!imageSet || !Array.isArray(imageSet.items)) return;

  await Promise.all(
    imageSet.items.map((item) => {
      const absolute = join(
        config.blog_static_files_dir,
        blogID,
        item.path
      );
      return fs.remove(absolute).catch(() => {});
    })
  );
}

async function lookupThumbnails(remoteImage, blogID, transformer) {
  const fallback = async () => {
    const buffer = await fetchImageBuffer(remoteImage);
    if (!buffer) return null;
    return processThumbnails(buffer, remoteImage, blogID);
  };

  return transformerLookup(
    transformer,
    remoteImage,
    createThumbnailTransform(blogID, remoteImage),
    fallback
  );
}

async function fetchImageBuffer(remoteImage) {
  try {
    const response = await fetch(remoteImage, {
      redirect: "follow",
      timeout: REQUEST_TIMEOUT,
      headers: {
        "user-agent": "Blot Link Cards (+https://blot.im)",
        accept: "image/*",
      },
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    return null;
  }
}

function createThumbnailTransform(blogID, remoteImage) {
  return function (path, callback) {
    fs.readFile(path)
      .then((buffer) => processThumbnails(buffer, remoteImage, blogID))
      .then((result) => {
        if (!result) return callback(new Error("No thumbnails"));
        callback(null, result);
      })
      .catch((err) => callback(err));
  };
}

async function processThumbnails(buffer, remoteImage, blogID) {
  try {
    const metadata = await sharp(buffer).metadata();

    const outputFormat = selectOutputFormat(metadata);
    if (!outputFormat) return null;

    const baseName = crypto
      .createHash("sha1")
      .update(remoteImage)
      .digest("hex");

    const directory = join(
      config.blog_static_files_dir,
      blogID,
      THUMBNAIL_DIRECTORY
    );

    await fs.ensureDir(directory);

    const usedWidths = new Set();
    const items = [];

    for (const candidate of THUMBNAIL_WIDTHS) {
      const targetWidth = determineTargetWidth(candidate, metadata.width);
      if (usedWidths.has(targetWidth)) continue;

      const filename = `${baseName}-${targetWidth}.${outputFormat}`;
      const absolutePath = join(directory, filename);

      await fs.remove(absolutePath).catch(() => {});

      const pipeline = sharp(buffer).resize({
        width: targetWidth,
        withoutEnlargement: true,
      });

      applyFormat(pipeline, outputFormat);

      const info = await pipeline.toFile(absolutePath);

      if (!info || !info.width) {
        await fs.remove(absolutePath).catch(() => {});
        continue;
      }

      usedWidths.add(info.width);

      items.push({
        width: info.width,
        height: info.height || null,
        path: `${THUMBNAIL_DIRECTORY}/${filename}`,
      });
    }

    if (items.length === 0) {
      return null;
    }

    return {
      remote: remoteImage,
      items,
    };
  } catch (err) {
    return null;
  }
}

function determineTargetWidth(candidate, originalWidth) {
  if (!originalWidth || !Number.isFinite(originalWidth)) return candidate;
  return Math.max(Math.min(candidate, Math.round(originalWidth)), 1);
}

function selectOutputFormat(metadata) {
  const allowed = new Set(["jpeg", "png", "webp", "avif"]);
  let format = metadata && metadata.format ? metadata.format.toLowerCase() : "";

  if (!allowed.has(format)) {
    format = metadata && metadata.hasAlpha ? "png" : "jpeg";
  }

  if (!allowed.has(format)) return null;

  return format === "jpeg" ? "jpg" : format;
}

function applyFormat(pipeline, format) {
  switch (format) {
    case "jpg":
      pipeline.jpeg({ quality: 80, progressive: true });
      break;
    case "png":
      pipeline.png({ compressionLevel: 9 });
      break;
    case "webp":
      pipeline.webp({ quality: 80 });
      break;
    case "avif":
      pipeline.avif({ quality: 70 });
      break;
    default:
      pipeline.jpeg({ quality: 80, progressive: true });
  }
}

module.exports = {
  render,
  category: "typography",
  title: "Link cards",
  description: "Convert bare external links into rich link cards",
  options: {
    layout: DEFAULT_LAYOUT,
    layoutCompact: true,
    layoutLarge: false,
  },
};
