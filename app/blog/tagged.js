module.exports = function (server) {
  const Entry = require("models/entry");
  const Tags = require("models/tags");


  // todo: refactor and consolidate ./render/retrieve/tagged.js and this file
  // they do very similar things but this one supports pagination and the other
  // supports multiple tags so merge them into a single function
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

      Tags.get(blogID, slug, options, function (err, ...results) {
        const [entryIDs, tag, totalEntries] = results;

        Entry.get(blogID, entryIDs || [], function (entries) {
          response.locals.tag = tag;
          response.locals.slug = slug;
          response.locals.total = totalEntries || 0;
          response.locals.entries = entries;
          response.locals.pagination = buildPagination(
            page,
            limit,
            totalEntries || 0
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
