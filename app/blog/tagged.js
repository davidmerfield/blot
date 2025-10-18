module.exports = function (server) {
  var Entry = require("models/entry");
  var Tags = require("models/tags");
  var _ = require("lodash");

  server.get(["/tagged/:tag", "/tagged/:tag/page/:page"], function (
    request,
    response,
    next
  ) {
    var blog = request.blog;
    var blogID = blog.id;
    var slug = request.params.tag;

    var page = parseInt(request.params.page, 10);
    if (!page || page < 1) page = 1;

    var perPage =
      request.template && request.template.locals
        ? request.template.locals.page_size
        : undefined;
    perPage = parseInt(perPage, 10);
    if (!perPage || perPage < 1 || perPage > 500) perPage = 100;

    var offset = (page - 1) * perPage;

    Tags.get(
      blogID,
      slug,
      { limit: perPage, offset: offset },
      function (err, entryIDs, tag, totalEntries) {
        if (err) return next(err);

        Entry.get(blogID, entryIDs || [], function (entries) {
          entries = _.sortBy(entries, "dateStamp").reverse();

          var pagination = buildPagination(slug, page, perPage, totalEntries || 0);

          if (!entries.length) {
            entries.push({ pagination: pagination });
          } else {
            entries[entries.length - 1].pagination = pagination;
          }

          response.locals.tag = tag;
          response.locals.slug = slug;
          response.locals.entries = entries;
          response.locals.total = totalEntries || 0;
          response.locals.pagination = pagination;

          response.renderView("tagged.html", next);
        });
      }
    );
  });
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
    nextUrl: nextUrl
  };
}
