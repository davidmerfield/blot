const { searchEntries } = require("../lib/models");
const getTemplateSortOptions = require("blog/sortOptions");

module.exports = async (req, res, next) => {
  req.log("search: start");

  try {
    let query = req.query.q || "";

    // if the query is an array (e.g. q=foo&q=bar)
    // we need to join it into a single string
    if (Array.isArray(query)) {
      query = req.query.q.join(" ");
    }

    // if the query variable is not a string, respond with 404 (don't fall through to view middleware)
    if (typeof query !== "string") {
      req.log("search: invalid query type");
      res.status(404);
      res.locals.error = {
        title: "Page not found",
        message: "There is no page with this URL.",
        status: 404,
      };
      return res.renderView("error.html", next);
    }

    if (query) {
      req.log("search: executing query", `query=${query.substring(0, 50)}`);
      res.locals.query = query;
      const sortOptions = getTemplateSortOptions(
        req.template && req.template.locals
      );
      // Entry.search sorts and caps by the selection before returning.
      res.locals.entries =
        (await searchEntries(req.blog.id, query, sortOptions)) || [];
      req.log("search: results found", `count=${res.locals.entries.length}`);
    } else {
      req.log("search: empty query");
    }

    // Don't cache search results
    res.set("Cache-Control", "no-cache");
    req.log("search: complete, rendering view");
    res.renderView("search.html", next);
  } catch (err) {
    req.log("search: error", err.message);
    return next(err);
  }
};
