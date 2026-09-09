var makeSlug = require("helper/makeSlug");

// makeSlug is called twice for unknown reasons
// but it could break something if we don't?
module.exports = function makeID(owner, name) {
  // Name is user input, it needs to be trimmed
  let slug = name.slice(0, 100);

  // The slug cannot contain a slash, or it messes
  // up the routing middleware.
  slug = makeSlug(slug).slice(0, 30);
  slug = slug.split("/").join("-");

  return owner + ":" + makeSlug(slug);
};
