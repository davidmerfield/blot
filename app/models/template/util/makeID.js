var makeSlug = require("helper/makeSlug");

var MAX_SLUG_LENGTH = 30;

// makeSlug is called twice for unknown reasons
// but it could break something if we don't?
module.exports = function makeID(owner, name) {
  // Name is user input, it needs to be trimmed
  let slug = name.slice(0, 100);

  // The slug cannot contain a slash, or it messes
  // up the routing middleware.
  slug = makeSlug(slug).slice(0, MAX_SLUG_LENGTH);
  slug = slug.split("/").join("-");

  // The second pass can re-expand a %-encoded byte from a non-ASCII name back
  // past the length limit (%F0 -> "-percentf0"), so cap it again and drop any
  // separator the cut left dangling. Without this the id can exceed 30
  // characters and stop being a fixed point of makeID, so no folder name — and
  // no template slug — can ever resolve back to it.
  slug = makeSlug(slug).slice(0, MAX_SLUG_LENGTH).replace(/[-/]+$/, "");

  return owner + ":" + slug;
};
