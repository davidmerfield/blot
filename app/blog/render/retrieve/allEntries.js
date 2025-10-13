var Entries = require("models/entries");

module.exports = function (req, callback) {
  Entries.getAll(req.blog.id, function (err, allEntries) {
    if (err) return callback(err);
    return callback(null, allEntries);
  });
};
