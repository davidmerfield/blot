const key = require("./key");
const client = require("models/client");
const Blog = require("models/blog");
const getMetadata = require("./getMetadata");
const getView = require("./getView");
const updateCdnManifest = require("./util/updateCdnManifest");

module.exports = function dropView(templateID, viewName, callback) {
  const multi = client.multi();

  getMetadata(templateID, function (err, metadata) {
    if (err) return callback(err);

    getView(templateID, viewName, function (err, view) {
      if (err) return callback(err);

      multi.del(key.view(templateID, viewName));
      multi.hdel(key.urlPatterns(templateID), viewName);
      multi.srem(key.allViews(templateID), viewName);

      // View might not neccessarily exist
      if (view) {
        multi.del(key.url(templateID, view.url));
        multi.del(key.view(templateID, view.name));
      }

      multi.exec(function (err) {
        if (err) return callback(err);

        Blog.set(metadata.owner, { cacheID: Date.now() }, function (cacheErr) {
          if (cacheErr) return callback(cacheErr);

          updateCdnManifest(templateID, function (manifestErr) {
            if (manifestErr) return callback(manifestErr);

            callback(null, "Deleted " + templateID);
          });
        });
      });
    });
  });
};
