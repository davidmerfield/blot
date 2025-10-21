const Entries = require("models/entries");

// Redirect to random article
module.exports = function (req, res, next) {
  // We preserve the query string for random in case
  // someone wants to get the entry JSON, or find the source
  const url = req.originalUrl;
  const queryIndex = url.indexOf("?");
  const queryString = queryIndex >= 0 ? url.slice(queryIndex) : "";

  Entries.random(req.blog.id, function (entry) {
    if (!entry || !entry.url) return next();
    res.set("Cache-Control", "no-cache");
    res.redirect(entry.url + queryString);
  });
};
