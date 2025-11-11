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
module.exports = function create (owner, name, metadata, callback) {
  // Owner represents the id of a blog
  // who controls the template
  // or the string 'SITE' which represents
  // a BLOT template not editable by any blog
  // ensure a blogID is always a number, never 'SITE'
  ensure(owner, "string")
    .and(metadata, "object")
    .and(name, "string")
    .and(callback, "function");

  // Name is user input, it needs to be trimmed
  name = name.slice(0, 100);

  // The slug cannot contain a slash, or it messes
  // up the routing middleware.
  metadata.slug = metadata.slug || makeSlug(name).slice(0, 30);
  metadata.slug = metadata.slug.split("/").join("-");

  // Each template has an ID which is namespaced under its owner
  metadata.id = makeID(owner, name);

  // Defaults
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

  let id = metadata.id;

  client.exists(key.metadata(id), function (err, stat) {
    if (err) throw err;

    // Don't overwrite an existing template
    if (stat) {
      err = new Error("A template called " + name + " name already exists");
      err.code = "EEXISTS";
      return callback(err);
    }

    client.sadd(key.blogTemplates(owner), id, function (err) {
      if (err) throw err;

      if (metadata.isPublic) {
        client.sadd(key.publicTemplates(), id, then);
      } else {
        client.srem(key.publicTemplates(), id, then);
      }

      function then (err) {
        if (err) throw err;

        setMetadata(id, metadata, function (err) {
          if (err) throw err;

          if (metadata.cloneFrom) {
            clone(metadata.cloneFrom, id, metadata, function (err) {
              if (err) return callback(err);
              callback(null, metadata);
            });
          } else {
            callback(null, metadata);
          }
        });
      }
    });
  });
};
