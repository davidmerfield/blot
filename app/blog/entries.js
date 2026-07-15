const { getPage } = require("models/entries");

module.exports = function (req, res, next) {
  const blogID = req?.blog?.id;

  const options = {
    sortBy: req?.template?.locals?.sort_by,
    order: req?.template?.locals?.sort_order,
    pageNumber: req?.params?.page ?? req?.query?.page,
    pageSize: req?.template?.locals?.page_size,
    pathPrefix: req?.template?.locals?.path_prefix,
  };

  req.log("Loading entries");
  getPage(blogID, options, (err, entries, pagination) => {
    if (err) {
      req.log("Error loading entries");
      return next(err);
    }

    req.log("Loaded entries");

    res.locals.entries = entries;
    res.locals.pagination = pagination;

    res.renderView("entries.html", next);
  });
};
