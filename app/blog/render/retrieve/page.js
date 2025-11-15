var Entries = require("models/entries");

module.exports = function (req, res, callback) {
  var blog = req.blog,
    rawPageNumber = req.query.page,
    pageSize = req.blog.pageSize || 5;

  Entries.getPage(blog.id, rawPageNumber, pageSize, function (error, entries, pagination) {
    if (error) {
      // Validation error from the model
      if (error.statusCode === 400) {
        return callback(new Error("Invalid page number"));
      }
      // Other errors
      return callback(error);
    }

    // Guard against missing pagination object (e.g., if Redis fails)
    // Note: pagination.current is already set by the model

    return callback(null, {
      entries: entries,
      pagination: pagination,
    });
  });
};
