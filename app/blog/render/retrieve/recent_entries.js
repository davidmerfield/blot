var getTemplateSortOptions = require("blog/sortOptions");
var Entries = require("models/entries");
var sortEntries = getTemplateSortOptions.sortEntries;

module.exports = function (req, res, callback) {
  Entries.getRecent(req.blog.id, function (recentEntries) {
    // getRecent returns the newest entries; the "Post sorting" control can flip
    // this to oldest-first or file-path order for feeds and recent-post lists.
    var sortOptions = getTemplateSortOptions(req.template && req.template.locals);
    return callback(null, sortEntries(recentEntries, sortOptions));
  });
};
