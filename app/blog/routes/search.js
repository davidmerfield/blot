const searchQueryString = require("../lib/searchQuery");

module.exports = function (req, res, next) {
  const query = searchQueryString(req.query.q || "");

  // Non-string q (e.g. ?q[foo]=bar) → 404. Do not fall through to view middleware.
  if (typeof query !== "string") {
    res.status(404);
    res.locals.error = {
      title: "Page not found",
      message: "There is no page with this URL.",
      status: 404,
    };
    return res.renderView("error.html", next);
  }

  res.set("Cache-Control", "no-cache");
  res.renderView("search.html", next);
};
