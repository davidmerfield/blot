module.exports = function (server) {
  var Entry = require("models/entry");
  var Tags = require("models/tags");
  var _ = require("lodash");

  server.get("/tagged/:tag*", function (request, response, next) {
    var blog = request.blog;
    var blogID = blog.id;
    var slug = request.params.tag;

    Tags.get(blogID, slug, function (err, entryIDs, tag) {
      if (err) return next(err);
      Entry.get(blogID, entryIDs, function (err, entries) {
        if (err) return next(err);
        entries = _.sortBy(entries, "dateStamp").reverse();

        response.locals.tag = tag;
        response.locals.slug = slug;
        response.locals.entries = entries;
        response.locals.total = entries.length;

        response.renderView("tagged.html", next);
      });
    });
  });
};
