const { createTransformer } = require("./transformers");
const { loadMetadata } = require("./loader");
const {
  buildCardHTML,
  replaceWithCard,
  shouldTransform,
  normalizeLayout,
} = require("./dom");
const { DEFAULT_LAYOUT } = require("./constants");

function render($, callback, options = {}) {
  const layout = normalizeLayout(options.layout);
  const elements = [];
  const htmlTransformer = createTransformer(options.blogID, "link-cards");
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
