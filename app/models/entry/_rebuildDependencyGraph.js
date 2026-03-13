var client = require("models/client");
var dependentsKey = require("./key").dependents;
var _ = require("lodash");

// The purpose of this function is to store the
// fact that a given blog post is dependent on
// the contents of another file in the blog's folder.
// For each dependency's path, we add this entry's path
// to the set containing the dependency's dependents!
// This means when the dependency changes (even if it is
// not an entry) we can rebuild this entry.

module.exports = function (blogID, entry, previous_dependencies, callback) {
  var removed_dependencies = [];
  var new_dependencies = [];
  var multi = client.multi();

  // Since this post is no longer available, none of its current or former
  // dependencies are still dependencies. Remove everything.
  if (entry.deleted) {
    removed_dependencies = _.union(entry.dependencies, previous_dependencies);

    // Since this post exists, we need to work out which dependencies were
    // added since the last time this post was saved. We also need to work
    // out which dependencies were removed.
  } else {
    new_dependencies = _.difference(entry.dependencies, previous_dependencies);
    removed_dependencies = _.difference(
      previous_dependencies,
      entry.dependencies
    );
  }

  removed_dependencies.forEach(function (path) {
    multi.SREM(dependentsKey(blogID, path), entry.path);
  });

  new_dependencies.forEach(function (path) {
    multi.SADD(dependentsKey(blogID, path), entry.path);
  });

  multi.exec(callback);
};
