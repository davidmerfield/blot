module.exports = function (server) {
  var Entry = require("models/entry");
  var Tags = require("models/tags");
  var _ = require("lodash");

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

      Tags.get(
        blogID,
        slug,
        { limit, offset },
        function (err, entryIDs, tag, total) {
          Entry.get(blogID, entryIDs || [], function (entries) {
            entries = _.sortBy(entries, "dateStamp").reverse();

            var pagination = buildPagination(slug, page, limit, total || 0);

            response.locals.tag = tag;
            response.locals.slug = slug;
            response.locals.entries = entries;
            response.locals.total = total || 0;
            response.locals.pagination = pagination;

            response.renderView("tagged.html", next);
          });
        }
      );
    }
  );
};

function buildPagination(slug, page, perPage, totalEntries) {
  var baseUrl = "/tagged/" + (slug || "");
  var totalPages = perPage > 0 ? Math.ceil(totalEntries / perPage) : 0;

  if (!totalEntries) {
    totalPages = 0;
  }

  var hasPrev = page > 1;
  var hasNext = totalPages > 0 && page < totalPages;

  var prevUrl = null;
  var nextUrl = null;

  if (hasPrev) {
    var prevPage = page - 1;
    prevUrl = prevPage === 1 ? baseUrl : baseUrl + "/page/" + prevPage;
  }

  if (hasNext) {
    var nextPage = page + 1;
    nextUrl = baseUrl + "/page/" + nextPage;
  }

  return {
    page: page,
    perPage: perPage,
    totalEntries: totalEntries,
    totalPages: totalPages,
    hasPrev: hasPrev,
    hasNext: hasNext,
    prevUrl: prevUrl,
    nextUrl: nextUrl,
  };
}
