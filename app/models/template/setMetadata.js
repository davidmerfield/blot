var key = require("./key");
var client = require("models/client");
var getMetadata = require("./getMetadata");
var serialize = require("./util/serialize");
var metadataModel = require("./metadataModel");
var ensure = require("helper/ensure");
var Blog = require("models/blog");
var injectLocals = require("./injectLocals");
var updateCdnManifest = require("./util/updateCdnManifest");

module.exports = function setMetadata(id, updates, callback) {
  try {
    ensure(id, "string").and(updates, "object").and(callback, "function");
  } catch (e) {
    return callback(e);
  }

  getMetadata(id, function (err, metadata) {
    var changes;

    metadata = metadata || {};

    for (var i in updates) {
      if (metadata[i] !== updates[i]) changes = true;
      metadata[i] = updates[i];
    }

    metadata.cdn = metadata.cdn || {};

    if (!metadata.owner)
      return callback(
        new Error("No owner: please specify an owner for this template")
      );

    try {
      injectLocals(metadata.locals);
    } catch (e) {
      console.log("error injecting locals:", e);
    }

    metadata = serialize(metadata, metadataModel);

    if (metadata.isPublic) {
      client.sadd(key.publicTemplates(), id);
    } else {
      client.srem(key.publicTemplates(), id);
    }

    client.sadd(key.blogTemplates(metadata.owner), id, function (err) {
      if (err) return callback(err);

      client.hmset(key.metadata(id), metadata, function (err) {
        if (err) return callback(err);

        if (!changes) {
          return updateCdnManifest(id, function (manifestErr) {
            if (manifestErr) return callback(manifestErr);
            callback(null, changes);
          });
        }

        const shouldBumpCache = !(metadata.isPublic || metadata.owner === "SITE");

        const regenerateManifest = function () {
          updateCdnManifest(id, function (manifestErr) {
            if (manifestErr) return callback(manifestErr);
            callback(null, changes);
          });
        };

        if (!shouldBumpCache) {
          return regenerateManifest();
        }

        Blog.set(metadata.owner, { cacheID: Date.now() }, function (cacheErr) {
          if (cacheErr) return callback(cacheErr);
          regenerateManifest();
        });
      });
    });
  });
};
