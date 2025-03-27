var ensure = require("helper/ensure");

module.exports = function (blog, entry, callback) {
  var changes = [];

  ensure(blog, "object").and(entry, "object").and(callback, "function");

  if (!entry.dependencies) {
    entry.dependencies = [];
    changes.push("dependencies");
  }

  if (!entry.backlinks) {
    entry.backlinks = [];
    changes.push("backlinks");
  }

  if (!entry.internalLinks) {
    entry.internalLinks = [];
    changes.push("internalLinks");
  }

  return callback(entry, changes);
};
