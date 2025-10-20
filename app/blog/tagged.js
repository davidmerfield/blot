module.exports = function (server) {
  const Entry = require("models/entry");
  const retrieveTagged = require("./render/retrieve/tagged");

  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    function (request, response, next) {
      var blog = request.blog;
      var blogID = blog.id;
      var slug = request.params.tag;

      var page = parseInt(request.params.page, 10);
      if (!page || page < 1) page = 1;

      var limit =
        request.template && request.template.locals
          ? request.template.locals.page_size
          : undefined;

      limit = parseInt(limit, 10);

      if (!limit || limit < 1 || limit > 500) limit = 100;

      var offset = (page - 1) * limit;
      var options = { limit, offset };

      retrieveTagged.fetch(blogID, [slug], options, function (err, result) {
        if (err) return next(err);

        const totalEntries =
          result.total !== undefined
            ? result.total
            : (result.entryIDs || []).length;

        Entry.get(blogID, result.entryIDs || [], function (entries) {
          response.locals.tag = result.tag || slug;
          response.locals.slug = slug;
          response.locals.total = totalEntries;
          response.locals.entries = entries;
          response.locals.tagged = result.tagged;
          response.locals.pagination = buildPagination(
            page,
            limit,
            totalEntries
          );

          response.renderView("tagged.html", next);
        });
      });
    }
  );
};

function buildPagination(current, pageSize, totalEntries) {
  var totalPages = pageSize > 0 ? Math.ceil(totalEntries / pageSize) : 0;

  if (!totalEntries) {
    totalPages = 0;
  }

  var previous = current > 1 ? current - 1 : null;
  var next = totalPages > 0 && current < totalPages ? current + 1 : null;

  return {
    current,
    pageSize,
    total: totalPages,
    totalEntries: totalEntries,
    previous,
    next,
  };
}
