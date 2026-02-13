var Template = require("models/template");
var LRUCache = require("lru-cache").LRUCache;

// This cache is safe because the key includes blog/template/view identity,
// plus blog.cacheID which changes whenever render-relevant blog data changes.
var fullViewCache = new LRUCache({
  max: 1000,
});

function createCacheKey(blog, template, viewName) {
  var blogID = blog && blog.id;
  var cacheID = blog && blog.cacheID;
  var templateID = template && template.id;

  return [blogID, cacheID, templateID, viewName]
    .map(function (part) {
      return String(part);
    })
    .join(":");
}

module.exports = function getCachedFullView(options, callback) {
  var blog = options.blog;
  var template = options.template;
  var viewName = options.viewName;

  var key = createCacheKey(blog, template, viewName);

  if (fullViewCache.has(key)) {
    return callback(null, fullViewCache.get(key));
  }

  Template.getFullView(blog.id, template.id, viewName, function (err, response) {
    if (err) {
      return callback(err);
    }

    fullViewCache.set(key, response);

    return callback(null, response);
  });
};

module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  fullViewCache.clear();
};
