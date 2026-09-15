const { getFullView } = require("../lib/models");
const { cloneDeep, prepareCacheValue } = require("../lib/clone");
const LRUCache = require("lru-cache").LRUCache;

// This cache is safe because the key includes blog/template/view identity,
// plus blog.cacheID which changes whenever render-relevant blog data changes.
const fullViewCache = new LRUCache({
  max: 1000,
  // Bound by bytes too: unbounded-size views (large templates/partials)
  // shouldn't be able to fill the cache's memory budget on their own.
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});

const inflight = new Map();

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

async function getCachedFullView(options) {
  const blog = options.blog;
  const template = options.template;
  const viewName = options.viewName;

  const key = createCacheKey(blog, template, viewName);

  if (fullViewCache.has(key)) {
    return cloneDeep(fullViewCache.get(key).payload);
  }

  if (inflight.has(key)) {
    return cloneDeep(await inflight.get(key));
  }

  const promise = getFullView(blog.id, template.id, viewName).then((response) => {
    const prepared = prepareCacheValue(response);
    fullViewCache.set(key, prepared);
    return prepared.payload;
  });

  inflight.set(key, promise);

  try {
    return cloneDeep(await promise);
  } finally {
    inflight.delete(key);
  }
}

module.exports = getCachedFullView;
module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  fullViewCache.clear();
  inflight.clear();
};
