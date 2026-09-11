const Template = require("models/template");
const { cloneDeep, deepFreeze } = require("../lib/clone");
const LRUCache = require("lru-cache").LRUCache;

// This cache is safe because the key includes blog/template/view identity,
// plus blog.cacheID which changes whenever render-relevant blog data changes.
const fullViewCache = new LRUCache({
  max: 1000,
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

async function getCachedFullViewAsync(options) {
  const blog = options.blog;
  const template = options.template;
  const viewName = options.viewName;

  const key = createCacheKey(blog, template, viewName);

  if (fullViewCache.has(key)) {
    return cloneDeep(fullViewCache.get(key));
  }

  const response = await new Promise((resolve, reject) => {
    Template.getFullView(blog.id, template.id, viewName, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const immutableCopy = deepFreeze(cloneDeep(response));
  fullViewCache.set(key, immutableCopy);

  return cloneDeep(immutableCopy);
}

// Dual API: promise when called without a callback, callback-style otherwise.
module.exports = function getCachedFullView(options, callback) {
  const promise = getCachedFullViewAsync(options);

  if (typeof callback === "function") {
    promise.then((result) => callback(null, result), callback);
    return;
  }

  return promise;
};

module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  fullViewCache.clear();
};
