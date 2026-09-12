module.exports = function register(blog) {
  // Prevent robots from indexing
  // preview subdomains to ward off
  // accusations of farming content

  // do the same in case the user
  // has a custom domain as well.
  blog.get("/robots.txt", function (req, res, next) {
    req.log(
      "robots: checking",
      `preview=${req.preview}`,
      `domain=${req.blog.domain || "none"}`,
      `originalHost=${req.originalHost}`
    );
    if (
      req.preview ||
      (req.blog.domain && req.originalHost !== req.blog.domain)
    ) {
      req.log("robots: serving disallow-all (preview or non-canonical domain)");
      res.header("Content-type", "text/plain");
      const robotsContent = `User-agent: *
Disallow: /`;
      return res.send(robotsContent);
    }

    req.log("robots: passing to next middleware");
    return next();
  });
};
