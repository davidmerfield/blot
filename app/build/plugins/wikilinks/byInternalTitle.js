const makeSlug = require("helper/makeSlug");

const INTERNAL_TITLE_KEYS = [
  "internalTitle",
  "internal-title",
  "internal title",
  "internal_title",
  "internaltitle",
];

function getInternalTitle(entry) {
  if (!entry || typeof entry !== "object") return "";

  const metadata = entry.metadata || {};

  for (const key of INTERNAL_TITLE_KEYS) {
    let value;

    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      value = metadata[key];
    } else if (Object.prototype.hasOwnProperty.call(entry, key)) {
      value = entry[key];
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  return "";
}

module.exports = function byInternalTitle(blogID, href, done) {
  const target = typeof href === "string" ? href.trim() : "";

  if (!target) {
    return done(new Error("No entry found by internal title"));
  }

  const { getAll } = require("models/entries");

  getAll(blogID, function (allEntries) {
    const perfectMatch = allEntries.find((entry) => {
      const internalTitle = getInternalTitle(entry);
      return internalTitle && internalTitle === target;
    });

    if (perfectMatch) return done(null, perfectMatch);

    const roughMatch = allEntries.find((entry) => {
      const internalTitle = getInternalTitle(entry);
      return (
        internalTitle && makeSlug(internalTitle) === makeSlug(target)
      );
    });

    if (roughMatch) return done(null, roughMatch);

    done(new Error("No entry found by internal title with href: " + target));
  });
};
