module.exports = function (server) {
  const retrieveTagged = require("./render/retrieve/tagged");

  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    function (request, response, next) {
      retrieveTagged(request, function (err, result) {
        if (err) return next(err);

        const slug = request.params.tag;
        const totalEntries =
          result && result.total !== undefined
            ? result.total
            : (result && result.entries ? result.entries.length : 0);

        response.locals.tagged = result || {};
        response.locals.tag = (result && result.tag) || slug;
        response.locals.slug = slug;
        response.locals.entries = (result && result.entries) || [];
        response.locals.total = totalEntries;
        response.locals.pagination = result ? result.pagination : undefined;
        response.locals.is = response.locals.tagged
          ? response.locals.tagged.tagged
          : undefined;

        if (response.locals.tagged) {
          response.locals.tagged.total = totalEntries;
          response.locals.tagged.entries = response.locals.entries;
          response.locals.tagged.pagination = response.locals.pagination;
          response.locals.tagged.tag = response.locals.tag;
          response.locals.tagged.slug = slug;
        }

        response.renderView("tagged.html", next);
      });
    }
  );
};
