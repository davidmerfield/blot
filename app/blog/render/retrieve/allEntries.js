var Entries = require("models/entries");

module.exports = function (req, res, callback) {
  Entries.getAll(req.blog.id, function (allEntries) {
    return callback(null, allEntries);
  });
};
