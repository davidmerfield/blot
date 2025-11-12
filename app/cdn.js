const config = require("config");
const express = require("express");
const cdn = new express.Router();
const { promisify } = require("util");
const Template = require("models/template");
const Blog = require("models/blog");
const renderMiddleware = require("./blog/render/middleware");
const blogDefaults = require("models/blog/defaults");

const getMetadata = promisify(Template.getMetadata);
const getBlog = promisify(Blog.get);

const GLOBAL_STATIC_FILES = config.blot_directory + "/app/blog/static";

const static = (path) =>
  express.static(path, {
    maxAge: "1y",
    fallthrough: false,
  });

// The health check
cdn.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send("OK: " + new Date().toISOString());
});

// Simple CORS middleware
// This means we can server font files from the CDN
// and they will still work on customer sites
cdn.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Global static files available to all blogs e.g.
// /fonts/agbalumo/400.ttf
// /plugins/katex/files/KaTeX_AMS-Regular.woff2
cdn.use("/fonts", static(GLOBAL_STATIC_FILES + "/fonts"));
cdn.use("/icons", static(GLOBAL_STATIC_FILES + "/icons"));
cdn.use("/katex", static(GLOBAL_STATIC_FILES + "/katex"));
cdn.use("/plugins", static(GLOBAL_STATIC_FILES + "/plugins"));

// Brochure and dashboard related static files, e.g.
// /documentation/v-8d7d9d72/favicon-180x180.png
// /documentation/v-76e1992c/documentation.min.css
cdn.use("/documentation/v-:version", static(config.views_directory));

// Serves files directly from a blog's folder e.g.
// /folder/blog_1234/favicon.ico
cdn.use("/folder/v-:version", static(config.blog_folder_dir));

cdn.get("/view/:templateID/:encodedView(*)", async (req, res, next) => {
  const templateID = req.params.templateID;
  const viewName = decodeViewParam(req.params.encodedView);

  try {
    const metadata = await getMetadata(templateID);
    if (!metadata) return next();

    const manifest = metadata.cdn || {};
    let blogRecord = null;

    if (metadata.owner && metadata.owner !== "SITE") {
      blogRecord = await getBlog({ id: metadata.owner });
      if (!blogRecord) return next();
    }

    const blogInput = blogRecord || buildBlogStub(metadata);
    blogInput.template = templateID;
    blogInput.templateManifest = manifest;

    const blog = Blog.extend(blogInput);

    req.blog = blog;
    req.preview = false;
    req.log = req.log || console.log;
    req.template = {
      locals: metadata.locals || {},
      id: templateID,
      cdn: manifest,
    };

    res.locals.partials = res.locals.partials || {};

    renderMiddleware(req, res, function (err) {
      if (err) return next(err);
      res.renderView(viewName, next);
    });
  } catch (err) {
    if (err && err.code === "ENOENT") return next();
    next(err);
  }
});

// Blog-specific static files, e.g.
// /blog_de64881e0dd94a5f8ba8f7aeaf807b86/_image_cache/739749f7-85eb-4b51-a6b9-c238b61c2c97.jpg
cdn.use(static(config.blog_static_files_dir));

module.exports = cdn;

function buildBlogStub(metadata) {
  const stub = JSON.parse(JSON.stringify(blogDefaults));

  stub.id = metadata.owner || "SITE";
  stub.owner = metadata.owner || "SITE";
  stub.handle =
    metadata.owner && metadata.owner !== "SITE" ? metadata.owner : "site";
  stub.template = metadata.id;
  stub.title = metadata.name || stub.title;
  stub.cacheID = Date.now();
  stub.menu = stub.menu || [];
  stub.status = stub.status || {
    message: "",
    syncID: "",
    datestamp: Date.now(),
  };
  stub.plugins = stub.plugins || {};
  stub.permalink = stub.permalink || {
    format: "{{slug}}",
    custom: "",
    isCustom: false,
  };

  return stub;
}

function decodeViewParam(path) {
  if (!path) return "";

  const decoded = path
    .split("/")
    .map(function (part) {
      try {
        return decodeURIComponent(part);
      } catch (err) {
        return part;
      }
    })
    .join("/");

  // Remove the 7-character hash inserted during CDN URL generation
  // Pattern: .XXXXXXX. where X is any character, inserted before the extension
  // Example: style.abc123d.css -> style.css
  // Example: style.min.abc123d.css -> style.min.css
  return decoded.replace(/\.(.{7})\.([^/]+)$/, ".$2");
}
