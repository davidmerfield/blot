const config = require("config");
const Express = require("express");
const redirector = require("./redirector");
const Email = require("helper/email");
const { join } = require("path");
const cookieParser = require('cookie-parser');

const documentation = Express.Router();

const VIEW_DIRECTORY = config.views_directory;

documentation.get(["/how/format/*", "/how/files/markdown", "/how/formatting/math"], function (req, res, next) {
  res.locals["show-on-this-page"] = true;
  next();
});

const files = [
  "/favicon-180x180.png",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/favicon.ico",
];

for (const path of files) {
  documentation.get(path, (req, res) =>
    res.sendFile(join(VIEW_DIRECTORY, path), {
      lastModified: false, // do not send Last-Modified header
      maxAge: "1y", // cache long-term
      acceptRanges: false, // do not allow ranged requests
      immutable: true, // the file will not change
    })
  );
}

// serve the VIEW_DIRECTORY as static files
documentation.use(
  Express.static(VIEW_DIRECTORY, {
    index: false, // Without 'index: false' this will server the index.html files inside
    redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
    maxAge: "1y", // cache long-term
    immutable: true,
  })
);

const directories = ["/fonts", "/css", "/images", "/js", "/videos"];

for (const path of directories) {
  documentation.use(
    path,
    Express.static(VIEW_DIRECTORY + path, {
      index: false, // Without 'index: false' this will server the index.html files inside
      redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
      maxAge: 86400000, // cache forever
    })
  );
}

documentation.use(require("./questions/related"));

documentation.get("/contact", (req, res, next) => {
  res.locals.fullWidth = true;
  next();
});

documentation.get(
  ["/about", "/how/configure", "/templates", "/questions"],
  (req, res, next) => {
    res.locals["hide-on-this-page"] = true;
    next();
  }
);

documentation.use(require("./selected"));

documentation.get("/", require("./templates.js"), function (req, res, next) {
  res.locals.title = "Blot";
  res.locals.description = "Turns a folder into a website";
  // otherwise the <title> of the page is 'Blot - Blot'
  res.locals.hide_title_suffix = true;
  next();
});

// Inject the CSRF token into the form
documentation.get(['/support', '/contact', '/feedback'], require("dashboard/util/csrf"));

documentation.post(
  ["/support", "/contact", "/feedback"],
  require("dashboard/util/parse"),
  cookieParser(),
  require("dashboard/util/csrf"),
  (req, res) => {
    const { email, message, contact_e879, contact_7d45 } = req.body;

    // honeypot fields
    if (email || message) {
      return res.status(400).send("Invalid request");
    }

    if (!contact_e879) return res.status(400).send("Message is required");

    Email.SUPPORT(null, { email: contact_7d45, message: contact_e879, replyTo: contact_7d45 });
    res.send("OK");
  }
);

documentation.get("/examples", require("./featured"));

documentation.get("/templates", require("./templates.js"));

documentation.get(
  "/templates/for-:type",
  require("./templates.js"),
  (req, res, next) => {
    res.locals.hidebreadcrumbs = true;
    res.render("templates");
  }
);

documentation.get(
  "/templates/:template",
  require("./templates.js"),
  (req, res, next) => {
    if (!res.locals.template) return next();
    res.locals.layout = "partials/layout-full-screen";
    res.render("templates/template");
  }
);

documentation.use("/templates/fonts", require("./fonts"));

documentation.use("/developers", require("./developers"));

documentation.get("/sitemap.xml", require("./sitemap"));

documentation.use("/about", require("./about.js"));

documentation.use("/news", require("./news"));

documentation.use("/questions", require("./questions"));

function trimLeadingAndTrailingSlash(str) {
  if (!str) return str;
  if (str[0] === "/") str = str.slice(1);
  if (str[str.length - 1] === "/") str = str.slice(0, -1);
  return str;
}

documentation.use(function (req, res, next) {
  res.locals["show-main-section-right"] =
    (res.locals.selected && res.locals.selected.how === "selected") ||
    res.locals["show-toc"];
  res.locals["show-toc-or-on-this-page"] =
    res.locals["show-toc"] || res.locals["show-on-this-page"];
  next();
});

documentation.use(function (req, res, next) {
  const view = trimLeadingAndTrailingSlash(req.path) || "index";

  if (require("path").extname(view)) {
    return next();
  }

  res.render(view);
});

documentation.use((err, req, res, next) => {
  if (err && err.message.startsWith("Failed to lookup view")) return next();
  next(err);
});

// Will redirect old broken links
documentation.use(redirector);

// Missing page
documentation.use(function (req, res, next) {
  const err = new Error("Page not found");
  err.status = 404;
  next(err);
});

// Some kind of other error
// jshint unused:false
documentation.use(function (err, req, res, next) {
  res.locals.code = { error: true };

  if (config.environment === "development") {
    res.locals.error = { stack: err.stack };
  }

  res.locals.layout = "";
  res.status(err.status || 400);
  res.render("error");
});

module.exports = documentation;
