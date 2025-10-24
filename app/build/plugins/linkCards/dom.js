const { URL } = require("url");
const he = require("he");

const { DEFAULT_LAYOUT, VALID_LAYOUTS } = require("./constants");

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

function normalizeLayout(layout) {
  if (!layout || typeof layout !== "string") return DEFAULT_LAYOUT;
  const normalized = layout.toLowerCase();
  return VALID_LAYOUTS.has(normalized) ? normalized : DEFAULT_LAYOUT;
}

function buildImageMarkup(metadata, layout) {
  const imageSet = metadata.imageSet;
  const src = metadata.image;

  if (!src) return "";

  const attrs = [`src="${escapeAttribute(src)}"`, 'alt=""', 'loading="lazy"'];

  if (imageSet && imageSet.srcset) {
    attrs.push(`srcset="${escapeAttribute(imageSet.srcset)}"`);
    const sizes =
      layout === "large"
        ? "(max-width: 600px) 100vw, 600px"
        : "(max-width: 600px) 100vw, 96px";
    attrs.push(`sizes="${escapeAttribute(sizes)}"`);
  }

  return `<img ${attrs.join(" ")}>`;
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

function textContent(str) {
  return (str || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
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

function escapeHTML(str) {
  return he.encode(String(str || ""), {
    useNamedReferences: true,
  });
}

function escapeAttribute(str) {
  return he
    .encode(String(str || ""), {
      useNamedReferences: true,
    })
    .replace(/"/g, "&quot;");
}

module.exports = {
  buildCardHTML,
  replaceWithCard,
  shouldTransform,
  normalizeLayout,
};
