const type = require("helper/type");
const store404 = require("models/404").set;
const config = require("config");
const path = require("path");
const clfdate = require("helper/clfdate");
const { checkRedirect } = require("../lib/models");

const VIEW_DIR = path.resolve(__dirname + "/../../views");

module.exports = function register(blog) {
  // Redirects
  blog.use(async function (req, res, next) {
    req.log("redirects: checking", `url=${req.url}`);
    try {
      const redirect = await checkRedirect(req.blog.id, req.url);

      // Nothing in the user's setup matches this
      // URL so continue to the next middleware
      if (!redirect) {
        req.log("redirects: no match");
        return next();
      }

      // It matched a redirect but since we don't
      // want an infinite redirect loop we continue
      if (redirect === req.url) {
        req.log("redirects: self-redirect prevented");
        return next();
      }

      req.log("redirects: redirecting", `to=${redirect}`);
      // By default, res.redirect returns a 302 status
      // code (temporary) rather than 301 (permanent)
      res.redirect(301, redirect);
    } catch (err) {
      req.log("redirects: error", err.message);
      return next(err);
    }
  });

  // 404s
  blog.use(function (req, res, next) {
    req.log("error: 404", `url=${req.url}`);
    res.locals.error = {
      title: "Page not found",
      message: "There is no page with this URL.",
      status: 404,
    };

    res.status(404);
    res.renderView("error.html", next);

    // We expose these to the user
    store404(req.blog.id, req.url);
  });

  // Errors
  blog.use(function (err, req, res, next) {
    req.log(
      "error: handling error",
      `code=${err.code || "unknown"}`,
      `message=${err.message || "unknown"}`
    );
    // This reponse was partially finished
    // end it now and get over it...
    if (res.headersSent) {
      req.log("error: headers already sent, ending response");
      return res.end();
    }

    // Monit requests localhost/health to determine whether
    // to attempt to restart Blot's node Blot. If you remove
    // this, change monit.rc too. This middleware must come
    // before the blog middleware, since there is no blog with
    // the host 'localhost' and hence returns a 404, bad!
    if (err.code === "ENOENT" && req.hostname === "localhost") {
      req.log("error: localhost health check passthrough");
      return next();
    }

    // Blog does not exist...
    if (err.code === "ENOENT") {
      req.log("error: blog not found (ENOENT)");
      res.status(404);

      if (req.hostname.endsWith(config.host)) {
        res.sendFile(VIEW_DIR + "/error-no-blog.html");
      } else {
        res.sendFile(VIEW_DIR + "/error-almost-connected.html");
      }

      return;
    }

    let status = 400;

    if (err.status && type(err.status, "number")) status = err.status;

    req.log("error: template error", `status=${status}`);
    console.log(
      clfdate(),
      req.headers["x-request-id"] && req.headers["x-request-id"],
      "Template error:",
      err
    );

    res.locals.error = {
      title: "Error",
      message: "",
      status: err.status,
    };

    res.renderView("error.html", next, function (err, output) {
      if (err) {
        req.log("error: failed to render error page");
        return next(err);
      }

      req.log("error: error page rendered", `status=${status}`);
      res.status(status || 400);
      res.send(output);
    });
  });

  // There was an issue with renderView
  blog.use(function (err, req, res, next) {
    if (res.headersSent) return res.end();

    res.status(400);
    res.sendFile(VIEW_DIR + "/error-bad-render.html");
  });
};
