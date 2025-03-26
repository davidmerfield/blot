const config = require("config");
const express = require("express");
const cdn = new express.Router();

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

// Blog-specific static files, e.g.
// /blog_de64881e0dd94a5f8ba8f7aeaf807b86/_image_cache/739749f7-85eb-4b51-a6b9-c238b61c2c97.jpg
cdn.use(static(config.blog_static_files_dir));

module.exports = cdn;
