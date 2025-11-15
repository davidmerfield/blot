const { getPage } = require("models/entries");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;
  const pageNumber = req?.query?.page;
  const pageSize = req?.blog?.pageSize;

  getPage(blogID, { pageNumber, pageSize }, function (err, entries, pagination) {
    if (err) {
      return callback(err);
    }

    return callback(null, {
      entries,
      pagination,
    });
  });
};
