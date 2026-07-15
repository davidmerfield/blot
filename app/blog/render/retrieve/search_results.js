var Entry = require("models/entry");

module.exports = function (req, res, callback) {
  var blogID = req.blog.id;

  // We couldn't find a search query
  if (!req.query.q) {
    return callback(null, []);
  }

  Entry.search(blogID, req.query.q, callback);
};
