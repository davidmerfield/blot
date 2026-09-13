const { getPage } = require("../lib/models");
const getTemplateSortOptions = require("blog/sortOptions");
const { primeUntaggedCache } = require("../render/retrieve/posts");

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

    req.log("Loading entries");
    const { entries, pagination } = await getPage(blogID, options);
    req.log("Loaded entries");

    res.locals.entries = entries;
    res.locals.pagination = pagination;

    // Older/custom templates bind {{#entries}} directly; official templates
    // bind {{#posts}} instead. Seed retrieve/posts.js's cache with this
    // fetch so a view that also references {{#posts}} reuses it instead of
    // calling Entries.getPage again. See
    // https://github.com/davidmerfield/blot/issues/1844
    primeUntaggedCache(req, res, entries, pagination);

    res.renderView("entries.html", next);
  } catch (err) {
    req.log("Error loading entries");
    return next(err);
  }
};
