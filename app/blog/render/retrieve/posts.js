const { getPage } = require("models/entries");
const getTemplateSortOptions = require("blog/sortOptions");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;

  const sortOptions = getTemplateSortOptions(req?.template?.locals);

  const options = {
    sortBy: sortOptions.sortBy,
    order: sortOptions.order,
    pageNumber: req?.params?.page ?? req?.query?.page,
    pageSize: res.locals?.page_size ?? req?.template?.locals?.page_size,
    pathPrefix: res.locals?.path_prefix ?? req?.template?.locals?.path_prefix,
  };

  req.log("Loading page of entries");
  getPage(blogID, options, (err, entries, pagination) => {
    if (err) {
      return callback(err);
    }

    res.locals.pagination = pagination;
  
    callback(null, entries);
  });
};
