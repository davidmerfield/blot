var Entries = require("models/entries");

module.exports = function (req, callback) {
  Entries.getPage(req.blog.id, 1, 1, function (err, entries) {
    if (err) return callback(err);
    entries = entries || [];

    return callback(null, entries[0] || {});
  });
};
