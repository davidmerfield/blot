const Entries = require("models/entries");

/**
 * Handles rendering of the page with entries and pagination.
 */
module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;

  // Pass raw values - validation happens in the model
  const pageSize = req?.template?.locals?.page_size;
  const pageNumber = req?.params?.page;
  const sortBy = req?.template?.locals?.sort_by;
  const order = req?.template?.locals?.sort_order;

  Entries.getPage(
    blogID,
    { sortBy, order, pageNumber, pageSize },
    (err, entries) => {
      if (err) {
        return callback(err);
      }

      callback(null, entries);
    }
  );
};

