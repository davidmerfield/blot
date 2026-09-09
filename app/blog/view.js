const { getViewByURL } = require("models/template");

module.exports = function (req, res, next) {
  const template = req?.blog?.template;

  if (!template) return next();

  getViewByURL(template, req.url, function (err, viewName, params) {
    if (err) return next(err);

    if (!viewName) return next();

    // Overwrite the request params with the params parsed from the URL
    if (params) {
      req.params = params;
    }

    // expose the query and params to the view
    // DON'T set query directly because a lot of templates rely
    // on the previous mapping of req.query.q to res.locals.query
    res.locals.request = { query: req.query, params: req.params };

    return res.renderView(viewName, next);
  });
};
