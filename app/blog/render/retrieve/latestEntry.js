var Entries = require("models/entries");

module.exports = function (req, res, callback) {
  Entries.getPage(req.blog.id, { pageNumber: 1, pageSize: 1 }, function (error, entries) {
    if (error) {
      // If validation fails for page 1, something is seriously wrong
      // but we'll still return an empty entry to avoid breaking the flow
      return callback(null, {});
    }

    entries = entries || [];

    return callback(null, entries[0] || {});
  });
};
