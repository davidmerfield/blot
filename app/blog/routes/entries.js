const { getPage } = require("../lib/models");
const getTemplateSortOptions = require("blog/sortOptions");

module.exports = async function entries(req, res, next) {
  try {
    const blogID = req?.blog?.id;

    const sortOptions = getTemplateSortOptions(req?.template?.locals);

    const options = {
      sortBy: sortOptions.sortBy,
      order: sortOptions.order,
      pageNumber: req?.params?.page ?? req?.query?.page,
      pageSize: req?.template?.locals?.page_size,
      pathPrefix: req?.template?.locals?.path_prefix,
    };

    req.log(
      "entries: start",
      `page=${options.pageNumber || 1}`,
      `sortBy=${options.sortBy || "default"}`,
      `order=${options.order || "default"}`
    );
    const { entries, pagination } = await getPage(blogID, options);
    req.log(
      "entries: loaded",
      `count=${entries ? entries.length : 0}`,
      `totalPages=${pagination?.total || "unknown"}`
    );

    res.locals.entries = entries;
    res.locals.pagination = pagination;

    req.log("entries: complete, rendering view");
    res.renderView("entries.html", next);
  } catch (err) {
    req.log("entries: error fetching page", err.message);
    return next(err);
  }
};
