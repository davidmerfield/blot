var makeID = require("./makeID");

var MAX_ITERATIONS = 5;

// A template is resolved everywhere by its id. writeToFolder names a locally
// edited template's on-disk directory after its stored slug and readFromFolder
// turns that name back into an id with makeID, so a slug which makeID maps to a
// *different* id lets the template be read back as another template and
// overwrite it (see models/template/create.js and readFromFolder.js).
//
// makeID truncates to 30 characters *between* two makeSlug passes, so its
// output is not always a fixed point: a %-encoded byte from a non-ASCII name
// can be cut mid-sequence and expand again on the next pass. Iterate until the
// slug maps to itself so the directory name always round-trips.
module.exports = function slugForName(owner, name) {
  var slug = suffix(makeID(owner, name));

  for (var i = 0; i < MAX_ITERATIONS; i++) {
    var next = suffix(makeID(owner, slug));
    if (next === slug) break;
    slug = next;
  }

  return slug;
};

function suffix(id) {
  return id.split(":").slice(1).join(":");
}
