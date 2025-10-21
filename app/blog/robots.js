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
};
