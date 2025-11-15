const { getPage } = require("models/entries");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;
  const pageNumber = req?.query?.page;
  const pageSize = req?.blog?.pageSize;
  req.log("Loading page of entries");

  getPage(
    blogID,
    { pageNumber, pageSize },
    function (err, entries, pagination) {
      if (err) {
        req.log("Error loading page of entries");
        return callback(err);
      }
      req.log("Loaded page of entries");

      return callback(null, {
        entries,
        pagination,
      });
    }
  );
};
