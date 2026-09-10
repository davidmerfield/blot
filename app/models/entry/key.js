var pathNormalize = require("helper/pathNormalizer");

module.exports = {
  url: function (blogID, url) {
    return "blog:" + blogID + ":url:" + url;
  },

  // Redis hash holding one field per entry property (see ./format.js). Fetched
  // with HGETALL, or HMGET for a field subset.
  entryHash: function (blogID, path) {
    return "blog:" + blogID + ":entry:hash:" + pathNormalize(path);
  },

  // Set representing the paths of files which depend on this particular
  // path. The path itself may or may not be its own entry.
  // A path cannot have dependencies however without it also being an entry
  // so we just stories the dependencies for an entry under its property
  dependents: function (blogID, path) {
    return "blog:" + blogID + ":dependents:" + pathNormalize(path);
  },

  search: function (blogID) {
    return "blog:" + blogID + ":search";
  },
};
