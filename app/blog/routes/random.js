const { randomEntry } = require("../lib/models");

// Redirect to random article
module.exports = async function random(req, res, next) {
  req.log("random: start");
  try {
    // We preserve the query string for random in case
    // someone wants to get the entry JSON, or find the source
    const url = req.originalUrl;
    const queryIndex = url.indexOf("?");
    const queryString = queryIndex >= 0 ? url.slice(queryIndex) : "";

    req.log("random: fetching random entry");
    const entry = await randomEntry(req.blog.id);
    if (!entry || !entry.url) {
      req.log("random: no entry found");
      return next();
    }
    req.log("random: redirecting", `entryUrl=${entry.url}`);
    res.set("Cache-Control", "no-cache");
    res.redirect(entry.url + queryString);
  } catch (err) {
    return next(err);
  }
};
