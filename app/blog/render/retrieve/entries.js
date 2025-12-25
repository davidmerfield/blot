const { getPage } = require("models/entries");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;

  const options = {
    sortBy: req?.template?.locals?.sort_by,
    order: req?.template?.locals?.sort_order,
    pageNumber: req?.params?.page ?? req?.query?.page,
    pageSize: req?.template?.locals?.page_size,
  };

  req.log("Loading entries");
  getPage(blogID, options, (err, entries, pagination) => {
    if (err) {
      req.log("Error loading entries");
      return callback(err);
    }

    req.log("Loaded entries");

    res.locals = res.locals || {};
    res.locals.entries = entries;
    res.locals.pagination = pagination;

    callback(null, entries);
  });
};
