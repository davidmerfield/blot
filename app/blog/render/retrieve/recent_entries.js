var getTemplateSortOptions = require("blog/sortOptions");
var Entries = require("models/entries");

// Feeds and "recent posts" widgets. getPage selects the first page in the
// requested order (Redis-paginated), so oldest-first / file-path selections
// return the blog's actual oldest or first/last entries — not the newest 31
// re-sorted. A missing selection validates to newest-first date.
module.exports = function (req, res, callback) {
  var sortOptions = getTemplateSortOptions(req.template && req.template.locals);

  Entries.getPage(
    req.blog.id,
    {
      pageNumber: 1,
      pageSize: 31,
      sortBy: sortOptions.sortBy,
      order: sortOptions.order,
    },
    function (err, entries) {
      if (err) return callback(err);
      return callback(null, entries || []);
    }
  );
};
