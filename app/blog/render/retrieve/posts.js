const { getPage } = require("models/entries");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;

  const options = {
    sortBy: req?.template?.locals?.sort_by,
    order: req?.template?.locals?.sort_order,
    pageNumber: req?.params?.page ?? req?.query?.page,
    pageSize: res.locals?.page_size ?? req?.template?.locals?.page_size,
    pathPrefix: res.locals?.path_prefix ?? req?.template?.locals?.path_prefix,
  };

  req.log("Loading page of entries");
  getPage(blogID, options, (err, entries) => {
    if (err) {
      return callback(err);
    }

    callback(null, entries);
  });
};
