var Entries = require("models/entries");

module.exports = function (req, res, callback) {
  Entries.getRecent(req.blog.id, function (recentEntries) {
    return callback(null, recentEntries);
  });
};
