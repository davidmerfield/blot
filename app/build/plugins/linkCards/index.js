const { URL } = require("url");
const crypto = require("crypto");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const { join, dirname } = require("path");
const config = require("config");
const he = require("he");

const CACHE_DIRECTORY = "_link_cards";
const DEFAULT_LAYOUT = "compact";
const VALID_LAYOUTS = new Set(["compact", "large"]);
const REQUEST_TIMEOUT = 10000;

function render($, callback, options = {}) {
  const layout = normalizeLayout(options.layout);
  const elements = [];

  $("a").each((_, el) => {
    if (shouldTransform($, el, options)) {
      elements.push(el);
    }
  });

  (async () => {
    for (const el of elements) {
      const href = $(el).attr("href");

      try {
        const metadata = await loadMetadata(href, options.blogID);
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

async function loadMetadata(href, blogID) {
  if (!href) return null;

  const cachePath = getCachePath(blogID, href);

  const cached = await readCache(cachePath);
  if (cached) return cached;

  const fetched = await fetchMetadata(href);
  if (fetched) {
    fetched.url = href;
    await writeCache(cachePath, fetched);
    return fetched;
  }

  const fallback = fallbackMetadata(href);
  if (fallback) return fallback;

  return null;
}

async function fetchMetadata(href) {
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

function buildCardHTML(href, metadata, layout) {
  const safeHref = escapeAttribute(href);
  const pieces = [];

  if (metadata.image) {
    pieces.push(
      `<div class="link-card__thumbnail"><img src="${escapeAttribute(
        metadata.image
      )}" alt="" loading="lazy" /></div>`
    );
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

  if (metadata.image) {
    try {
      metadata.image = new URL(metadata.image, href).toString();
    } catch (err) {
      metadata.image = "";
    }
  }

  if (!metadata.siteName) {
    metadata.siteName = formatDisplayURL(href);
  }
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
