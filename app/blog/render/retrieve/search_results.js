var getTemplateSortOptions = require("blog/sortOptions");
var Entry = require("models/entry");
var sortEntries = getTemplateSortOptions.sortEntries;

module.exports = function (req, res, callback) {
  var blogID = req.blog.id;

  // We couldn't find a search query
  if (!req.query.q) {
    return callback(null, []);
  }

  var sortOptions = getTemplateSortOptions(req.template && req.template.locals);

  // Entry.search applies the ordering before its result cap; sortEntries here
  // also covers the default (no explicit sort_by) case.
  Entry.search(blogID, req.query.q, sortOptions, function (err, results) {
    if (err) return callback(err);
    callback(null, sortEntries(results, sortOptions));
  });
};
