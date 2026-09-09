var makeID = require("./makeID");

// A template is resolved everywhere by its id. writeToFolder names a template's
// on-disk directory after its stored slug and readFromFolder turns that name
// back into an id with makeID, so a slug which makeID maps to a *different* id
// lets a locally edited template be read back as another template and overwrite
// it (see models/template/create.js and readFromFolder.js).
//
// This returns the slug which cannot drift: the id's own suffix. Callers that
// build a template should use it rather than passing a hand-made slug which may
// not survive makeID's 30-character truncation and re-slug.
module.exports = function slugForName(owner, name) {
  return makeID(owner, name).split(":").slice(1).join(":");
};
