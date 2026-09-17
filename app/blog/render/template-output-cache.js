const LRUCache = require("lru-cache").LRUCache;

// Caches the fully-rendered output of a CSS/JS template view (Mustache
// render + folder-link resolution for CSS) per viewing blog. This is safe
// because the key includes blog/template/view identity, plus
// blog.cacheID, which changes whenever this blog's own folder or
// render-relevant data changes - exactly the same key shape as
// full-view-cache.js, and for the same reason: blogID in the key is always
// the *viewing* blog, so two different blogs sharing the same SITE/public
// template produce different cache keys (and correctly reflect each
// blog's own folder contents) even though templateID/viewName match.
//
// Known, pre-existing limitation (not introduced here): if the template's
// own CSS/JS content changes, only the template owner's cacheID bumps
// (app/models/template/setView.js), so other blogs currently using a
// shared/public template won't see the new output until their own
// cacheID next changes for an unrelated reason. full-view-cache.js already
// has this exact property today via the identical key shape.
const templateOutputCache = new LRUCache({
  max: 1000,
  // Bound by bytes too: unbounded-size views shouldn't be able to fill
  // the cache's memory budget on their own.
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => Buffer.byteLength(value) || 1,
});

function createCacheKey(blog, template, viewName) {
  const blogID = blog && blog.id;
  const cacheID = blog && blog.cacheID;
  const templateID = template && template.id;

  return JSON.stringify({
    blogID: String(blogID),
    cacheID: String(cacheID),
    templateID: String(templateID),
    viewName: String(viewName),
  });
}

async function getTemplateOutputCache(options) {
  const blog = options.blog;
  const template = options.template;
  const viewName = options.viewName;
  const compute = options.compute;

  const key = createCacheKey(blog, template, viewName);

  if (templateOutputCache.has(key)) {
    return templateOutputCache.get(key);
  }

  const output = await compute();

  templateOutputCache.set(key, output);

  return output;
}

module.exports = getTemplateOutputCache;
module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  templateOutputCache.clear();
};
