var Entries = require("models/entries");

module.exports = function (req, callback) {
  Entries.getRecent(req.blog.id, function (err, recentEntries) {
    if (err) return callback(err);
    return callback(null, recentEntries);
  });
};
