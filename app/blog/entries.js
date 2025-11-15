const Entries = require("models/entries");

/**
 * Handles rendering of the page with entries and pagination.
 */
module.exports = function (req, res, next) {
  const blogID = req?.blog?.id;

  // Pass raw values - validation happens in the model
  const pageSize = req?.template?.locals?.page_size;
  const pageNumber = req?.params?.page_number;
  const sortBy = req?.template?.locals?.sort_by;
  const order = req?.template?.locals?.sort_order;

  Entries.getPage(
    blogID,
    { sortBy, order, pageNumber, pageSize },
    (err, entries, pagination) => {
      if (err) {
        return next(err);
      }

      res.locals.entries = entries;
      res.locals.pagination = pagination;

      req.log("Rendering entries");
      res.renderView("entries.html", next);
    }
  );
};

