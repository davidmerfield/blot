const Entries = require("models/entries");

module.exports = function (req, res, callback) {
  Entries.getTotal(req.blog.id, callback);
};
