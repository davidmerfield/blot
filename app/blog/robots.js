var User = require("models/user");

module.exports = function (server) {
  // Prevent robots from indexing
  // preview subdomains to ward off
  // accusations of farming content

  // do the same in case the user
  // has a custom domain as well.
  server.get("/robots.txt", function (req, res, next) {
    if (
      req.preview ||
      (req.blog.domain && req.originalHost !== req.blog.domain)
    ) {
      res.header("Content-type", "text/plain");
      const robotsContent = `User-agent: *
Disallow: /`;
      return res.send(robotsContent);
    }

    return next();
  });

  // Called on individual blogs to
  // get the handle associated with them...
  server.get("/verify/domain-setup", function (req, res, next) {
    if (!req.blog || !req.blog.handle) return next();

    res.set("Cache-Control", "no-cache");
    res.send(req.blog.handle);
  });

  server.get("/verify/subscription-duration", function (req, res, next) {
    if (!req.blog || !req.blog.owner) return res.status(404).end();

    User.getById(req.blog.owner, function (err, user) {
      if (err) return next(err);
      if (!user) return res.status(404).end();

      var duration = User.subscriptionTenure.getSubscriptionDurationMs(user);

      if (!duration) return res.status(404).end();

      res.set("Cache-Control", "no-cache");
      res.set("Content-Type", "application/json; charset=utf-8");
      res.status(200).send({ duration });
    });
  });
};
