module.exports = function (server) {
  var type = require("helper/type");
  var Redirects = require("models/redirects");
  var store404 = require("models/404").set;
  var config = require("config");
  var VIEW_DIR = require("path").resolve(__dirname + "/../views");
  var clfdate = require("helper/clfdate");

  // Redirects
  server.use(function (req, res, next) {
    Redirects.check(req.blog.id, req.url, function (err, redirect) {
      if (err) return next(err);

      // Nothing in the user's setup matches this
      // URL so continue to the next middleware
      if (!redirect) return next();

      // It matched a redirect but since we don't
      // want an infinite redirect loop we continue
      if (redirect === req.url) return next();

      // By default, res.redirect returns a 302 status
      // code (temporary) rather than 301 (permanent)
      res.redirect(301, redirect);
    });
  });

  // 404s
  server.use(function (req, res, next) {
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
  server.use(function (err, req, res, next) {
    // This reponse was partially finished
    // end it now and get over it...
    if (res.headersSent) return res.end();

    // Monit requests localhost/health to determine whether
    // to attempt to restart Blot's node Blot. If you remove
    // this, change monit.rc too. This middleware must come
    // before the blog middleware, since there is no blog with
    // the host 'localhost' and hence returns a 404, bad!
    if (err.code === "ENOENT" && req.hostname === "localhost") {
      return next();
    }

    // Blog does not exist...
    if (err.code === "ENOENT") {
      res.status(404);

      if (req.hostname.endsWith(config.host)) {
        res.sendFile(VIEW_DIR + "/error-no-blog.html");
      } else {
        res.sendFile(VIEW_DIR + "/error-almost-connected.html");
      }

      return;
    }

    var status = 400;

    if (err.status && type(err.status, "number")) status = err.status;

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
      if (err) return next(err);

      res.status(status || 400);
      res.send(output);
    });
  });

  // There was an issue with renderView
  server.use(function (err, req, res, next) {
    if (res.headersSent) return res.end();

    res.status(400);
    res.sendFile(VIEW_DIR + "/error-bad-render.html");
  });
};
