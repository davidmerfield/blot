var clone = require("./clone");
var ensure = require("helper/ensure");
var makeSlug = require("helper/makeSlug");
var makeID = require("./util/makeID");
var client = require("models/client");
var key = require("./key");
var metadataModel = require("./metadataModel");
var setMetadata = require("./setMetadata");

// Associates a theme with a UID owner
// and an existing theme to clone if possible
module.exports = function create(owner, name, metadata, callback) {
  ensure(owner, "string")
    .and(metadata, "object")
    .and(name, "string")
    .and(callback, "function");

  name = name.slice(0, 100);
  metadata.slug = metadata.slug || makeSlug(name).slice(0, 30);
  metadata.slug = metadata.slug.split("/").join("-");
  metadata.id = makeID(owner, name);

  metadata.name = name;
  metadata.owner = owner;
  metadata.locals = metadata.locals || {};
  metadata.cdn = metadata.cdn || {};
  metadata.description = metadata.description || "";
  metadata.thumb = metadata.thumb || "";
  metadata.localEditing = metadata.localEditing === true;
  metadata.previewPath = "/";
  metadata.shareID = "";

  ensure(metadata, metadataModel);

  var id = metadata.id;

  (async function () {
    try {
      var stat = await client.exists(key.metadata(id));

      if (stat) {
        var err = new Error("A template called " + name + " name already exists");
        err.code = "EEXISTS";
        return callback(err);
      }

      await client.sAdd(key.blogTemplates(owner), id);
      if (metadata.isPublic) {
        await client.sAdd(key.publicTemplates(), id);
      } else {
        await client.sRem(key.publicTemplates(), id);
      }

      setMetadata(id, metadata, function (setErr) {
        if (setErr) return callback(setErr);

        if (metadata.cloneFrom) {
          return clone(metadata.cloneFrom, id, metadata, function (cloneErr) {
            if (cloneErr) return callback(cloneErr);
            callback(null, metadata);
          });
        }

        callback(null, metadata);
      });
    } catch (err) {
      callback(err);
    }
  })();
};
