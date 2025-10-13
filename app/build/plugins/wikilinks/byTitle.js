const makeSlug = require("helper/makeSlug");

module.exports = function byTitle(blogID, href, done) {
  // there is a circular dependency loop between the entries
  // model and build so this is neccessary for now...
  const { getAll } = require("models/entries");

  getAll(blogID, function (err, allEntries) {
    if (err) return done(err);
    const perfectMatch = allEntries.find((entry) => entry.title === href);

    if (perfectMatch) return done(null, perfectMatch);

    // Will trim, lowercase, remove punctuation, etc.
    const roughMatch = allEntries.find(
      (entry) => makeSlug(entry.title) === makeSlug(href)
    );

    if (roughMatch) return done(null, roughMatch);

    done(new Error("No entry found by title with href: " + href));
  });
};
