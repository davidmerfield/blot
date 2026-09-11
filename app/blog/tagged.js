module.exports = function (server) {
  const retrieveTagged = require("./render/retrieve/tagged");

  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    function (request, response, next) {
      request.log("tagged: start", `tag=${request.params.tag}`, `page=${request.params.page || 1}`);
      retrieveTagged(request, response, function (err, result) {
        if (err) {
          request.log("tagged: error", err.message);
          return next(err);
        }

        response.locals.slug = encodeURIComponent(request.params.tag);
        response.locals.tag = (result && result.tag) || request.params.tag;
        response.locals.entries = (result && result.entries) || [];
        response.locals.total = (result && result.total) || 0;
        response.locals.pagination = (result && result.pagination) || {};

        request.log("tagged: complete", `tag=${response.locals.tag}`, `entriesCount=${response.locals.entries.length}`, `total=${response.locals.total}`);
        response.renderView("tagged.html", next);
      });
    }
  );
};
