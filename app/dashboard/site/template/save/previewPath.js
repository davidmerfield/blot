const Template = require("models/template");

module.exports = function (req, res, next) {
  if (!req.body || !req.body.previewPath) return next();
  Template.update(
    req.blog.id,
    req.params.templateSlug,
    { previewPath: req.body.previewPath },
    function (err) {
      if (err) return next(err);
      res.sendStatus(200);
    }
  );
};
