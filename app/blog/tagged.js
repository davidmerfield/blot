module.exports = function (server) {
  const retrieveTagged = require("./render/retrieve/tagged");

  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    function (request, response, next) {
      retrieveTagged(request, function (err, result) {
        if (err) return next(err);

        const data = result || {};
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const slug =
          data.slug ||
          (Array.isArray(data.slugs) && data.slugs.length === 1
            ? data.slugs[0]
            : request.params.tag);
        const tag = data.tag || slug;
        const total =
          data.total !== undefined ? data.total : entries.length;

        const tagged = Object.assign({}, data, {
          entries,
          slug,
          tag,
          total,
        });

        response.locals.tagged = tagged;
        response.locals.tag = tagged.tag;
        response.locals.slug = tagged.slug;
        response.locals.entries = tagged.entries;
        response.locals.total = tagged.total;
        response.locals.pagination = tagged.pagination;
        response.locals.is = tagged.is;

        response.renderView("tagged.html", next);
      });
    }
  );
};
