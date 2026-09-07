module.exports = function (server) {
  const retrieveTagged = require("./render/retrieve/tagged");

  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    function (request, response, next) {
      retrieveTagged(request, response, function (err, result) {
        if (err) return next(err);

        response.locals.slug = encodeURIComponent(request.params.tag);
        response.locals.tag = (result && result.tag) || request.params.tag;
        response.locals.entries = (result && result.entries) || [];
        response.locals.total = (result && result.total) || 0;
        response.locals.pagination = (result && result.pagination) || {};

        response.renderView("tagged.html", next);
      });
    }
  );
};
