const { getPage } = require("models/entries");

module.exports = function (req, res, callback) {
  req.log("Loading latest entry");
  getPage(req.blog.id, { pageNumber: 1, pageSize: 1 }, function (err, entries) {
    req.log("Loaded latest entry");
    const latestEntry = entries && entries.length ? entries[0] : {};
    return callback(null, latestEntry);
  });
};
