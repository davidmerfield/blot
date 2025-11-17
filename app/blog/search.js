const Entry = require("models/entry");
const search = require("util").promisify(Entry.search);

module.exports = async (req, res, next) => {

  try {
    let query = req.query.q || "";

    // if the query is an array (e.g. q=foo&q=bar)
    // we need to join it into a single string
    if (Array.isArray(query)) {
      query = req.query.q.join(" ");
    } 

    // if the query variable is not a string, abort
    if (typeof query !== "string") {
      return next();
    }

    if (query) {
      res.locals.query = query;
      res.locals.entries = await search(req.blog.id, query) || [];  
    }

    // Don't cache search results
    res.set("Cache-Control", "no-cache");
    res.renderView("search.html", next);

  } catch (err) {
    return next(err);
  }
};
