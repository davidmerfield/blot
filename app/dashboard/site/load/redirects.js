const Redirects = require("models/redirects");

module.exports = function (req, res, next) {
  Redirects.list(req.blog.id, function (err, redirects) {
    if (err) return next(err);

    Redirects.conflicts(req.blog, redirects || [], function (conflictErr, annotated) {
      if (conflictErr) return next(conflictErr);

      res.locals.redirects = annotated;
      next();
    });
  });
};
