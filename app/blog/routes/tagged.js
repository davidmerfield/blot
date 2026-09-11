const retrieveTagged = require("../render/retrieve/tagged");
const callRetriever = require("../lib/callRetriever");

module.exports = function registerTagged(server) {
  server.get(
    ["/tagged/:tag", "/tagged/:tag/page/:page"],
    async function (req, res, next) {
      try {
        const result = await callRetriever(retrieveTagged, req, res);

        res.locals.slug = encodeURIComponent(req.params.tag);
        res.locals.tag = (result && result.tag) || req.params.tag;
        res.locals.entries = (result && result.entries) || [];
        res.locals.total = (result && result.total) || 0;
        res.locals.pagination = (result && result.pagination) || {};

        res.renderView("tagged.html", next);
      } catch (err) {
        return next(err);
      }
    }
  );
};
