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

  // The id, and every editor URL derived from it, is built from the name. A
  // name which slugs to nothing (e.g. "!!!") leaves an id of just the owner
  // and, through the fallback below, an empty slug — which writeToFolder would
  // treat as the templates root. Reject it rather than store the wreckage.
  var idSlug = metadata.id.split(":").slice(1).join(":");

  if (!idSlug) {
    var nameErr = new Error(
      "A template name must contain letters or numbers: " + name
    );
    nameErr.code = "ENOSLUG";
    return callback(nameErr);
  }

  // The id is the only thing routing, writeToFolder and readFromFolder resolve
  // a template by. writeToFolder names the template's on-disk directory after
  // the stored slug and readFromFolder turns that name back into an id with
  // makeID, so a slug which makeID maps to a *different* id lets a locally
  // edited template be read back as another template and overwrite it. A
  // caller-supplied slug (duplication, forking, adding a shared template) can
  // diverge as soon as the name is long enough for the 30-character truncation
  // to bite. Keep the slug in step with the id; a slug which already round-trips
  // (e.g. a local template named after its folder) is left untouched, anything
  // else falls back to the id's own suffix, which makeID maps to itself.
  if (makeID(owner, metadata.slug) !== metadata.id) {
    metadata.slug = idSlug;
  }

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
