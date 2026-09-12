const retrieveTagged = require("../render/retrieve/tagged");

module.exports = function register(blog) {
  blog.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    async function (req, res, next) {
      req.log(
        "tagged: start",
        `tag=${req.params.tag}`,
        `page=${req.params.page || 1}`
      );
      try {
        const result = await retrieveTagged(req, res);

        res.locals.slug = encodeURIComponent(req.params.tag);
        res.locals.tag = (result && result.tag) || req.params.tag;
        res.locals.entries = (result && result.entries) || [];
        res.locals.total = (result && result.total) || 0;
        res.locals.pagination = (result && result.pagination) || {};

        req.log(
          "tagged: complete",
          `tag=${res.locals.tag}`,
          `entriesCount=${res.locals.entries.length}`,
          `total=${res.locals.total}`
        );
        res.renderView("tagged.html", next);
      } catch (err) {
        req.log("tagged: error", err.message);
        return next(err);
      }
    }
  );
};
