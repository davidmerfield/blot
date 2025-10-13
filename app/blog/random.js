const Entries = require("models/entries");

// Redirect to random article
module.exports = function (req, res, next) {
  // We preserve the query string for random in case
  // someone wants to get the entry JSON, or find the source
  const url = req.originalUrl;
  const queryIndex = url.indexOf("?");
  const queryString = queryIndex >= 0 ? url.slice(queryIndex) : "";

  // todo: implement Entries.random using srandmember
  Entries.getAll(req.blog.id, function (err, entries) {
    if (err) return next(err);
    if (!entries || !entries.length) return next();
    let entry = randomFrom(entries);
    let attempts = 0;
    while (!entry.url && attempts < 100) {
      entry = randomFrom(entries);
      attempts++;
    }
    if (!entry.url) return next();
    res.set("Cache-Control", "no-cache");
    res.redirect(entry.url + queryString);
  });
};

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}
