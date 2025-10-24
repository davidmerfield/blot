const Template = require("models/template");
const { isAjaxRequest, sendAjaxResponse } = require("./ajax-response");

module.exports = function (req, res, next) {
  if (!req.body || !req.body.previewPath) return next();
  Template.update(
    req.blog.id,
    req.params.templateSlug,
    { previewPath: req.body.previewPath },
    function (err) {
      if (err) return next(err);

      if (isAjaxRequest(req)) {
        return sendAjaxResponse(res);
      }

      res.sendStatus(200);
    }
  );
};
