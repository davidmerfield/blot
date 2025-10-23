var Entries = require("models/entries");

module.exports = function (req, res, callback) {
  var blog = req.blog,
    pageNo = parseInt(req.query.page) || 1,
    pageSize = req.blog.pageSize || 5;

  Entries.getPage(blog.id, pageNo, pageSize, function (entries, pagination) {

    pagination.current = pageNo;

    return callback(null, {
      entries: entries,
      pagination: pagination,
    });
  });
};
