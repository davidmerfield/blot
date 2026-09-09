var makeID = require("./makeID");

// A template is resolved everywhere by its id. writeToFolder names a locally
// edited template's on-disk directory after its stored slug and readFromFolder
// turns that name back into an id with makeID, so a slug which makeID maps to a
// *different* id lets the template be read back as another template and
// overwrite it (see models/template/create.js and readFromFolder.js).
//
// makeID is a fixed point of itself, so its own suffix is the slug that cannot
// drift. Callers that build a template should use this rather than a hand-made
// slug which may not survive makeID's truncation and re-slug. Returns "" only
// for a name that slugs to nothing, which create() rejects.
module.exports = function slugForName(owner, name) {
  return makeID(owner, name).split(":").slice(1).join(":");
};
