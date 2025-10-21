const makeSlug = require("helper/makeSlug");

module.exports = function byTitle(blogID, href, done) {
  // there is a circular dependency loop between the entries
  // model and build so this is neccessary for now...
  // todo: replace this with paginated queries to avoid loading
  // all entries into memory at once which will crash large blogs
  const { getAll } = require("models/entries");

  getAll(blogID, function (allEntries) {
    const perfectMatch = allEntries.find((entry) => entry.title === href);

    if (perfectMatch) {
      return done(null, {
        url: perfectMatch.url,
        title: perfectMatch.title,
        path: perfectMatch.path
      });
    }

    // Will trim, lowercase, remove punctuation, etc.
    const roughMatch = allEntries.find(
      (entry) => makeSlug(entry.title) === makeSlug(href)
    );

    if (roughMatch) {
      return done(null, {
        url: roughMatch.url,
        title: roughMatch.title,
        path: roughMatch.path
      });
    }

    done(new Error("No entry found by title with href: " + href));
  });
};
