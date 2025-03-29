const config = require("config");
const express = require("express");
const mime = require("mime-types");
const debug = require("debug")("blot:blog:assets");
const { join, basename, dirname } = require("path");
const { promisify } = require("util");
const fs = require("fs-extra");

const caseSensitivePath = promisify(require("helper/caseSensitivePath"));

// Constants
const GLOBAL_STATIC_FILES = config.blot_directory + "/app/blog/static";
const LARGEST_POSSIBLE_MAXAGE = 86400000;
const BLOCKED_PATTERNS = ["..", ".php", "/.git", "\0"];
const STATIC_DIRS = ["/fonts", "/icons", "/katex", "/plugins"];
const BLOG_STATIC_PATHS = [
  "/_assets",
  "/_avatars",
  "/_bookmark_screenshots",
  "/_image_cache",
  "/_thumbnails",
];

// Utility functions
function createStaticMiddleware(path) {
  return express.static(path, { maxAge: "1y" });
}

function withoutTrailingSlash(path) {
  return path && path.slice(-1) === "/" ? path.slice(0, -1) : path;
}

function addLeadingUnderscore(path) {
  path = withoutTrailingSlash(decodeURIComponent(path));
  return join(dirname(path), "_" + basename(path));
}

function sendFile(res, path, { req, maxAge = 0, immutable = false } = {}) {
  const isDirectory = path.indexOf(".") === -1;
  const defaultMime = isDirectory ? "text/html" : "application/octet-stream";
  let contentType = mime.contentType(mime.lookup(path) || defaultMime);

  if (contentType === "application/mp4") {
    contentType = "video/mp4";
  }

  const options = {
    maxAge,
    immutable,
    dotfiles: "allow",
    headers: {
      "Content-Type": contentType,
    },
  };

  if (!maxAge && req && !req.query.cache && !req.query.extension) {
    options.headers["Cache-Control"] = "no-cache";
  }

  if (req && req.query.cache && req.query.extension) {
    options.maxAge = LARGEST_POSSIBLE_MAXAGE;
  }

  return new Promise((resolve, reject) => {
    res.sendFile(path, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Router setup
const assets = express.Router();

// Security middleware
assets.use((req, res, next) => {
  if (
    BLOCKED_PATTERNS.some(
      (pattern) =>
        req.path.includes(pattern) ||
        decodeURIComponent(req.path).includes(pattern)
    )
  ) {
    return next(new Error("Not Found"));
  }
  next();
});

// Global static files
STATIC_DIRS.forEach((dir) => {
  assets.use(dir, createStaticMiddleware(GLOBAL_STATIC_FILES + dir));
});

assets.get("/html2canvas.min.js", (req, res) => {
  sendFile(res, GLOBAL_STATIC_FILES + "/html2canvas.min.js", {
    req,
    maxAge: LARGEST_POSSIBLE_MAXAGE,
    immutable: true,
  });
});

assets.get("/layout.css", (req, res) => {
  sendFile(res, GLOBAL_STATIC_FILES + "/layout.css", {
    req,
    maxAge: LARGEST_POSSIBLE_MAXAGE,
    immutable: true,
  });
});

// Blog-specific static assets
assets.use(BLOG_STATIC_PATHS, async (req, res, next) => {
  try {
    const filePath =
      config.blog_folder_dir + "/" + req.blog.id + decodeURIComponent(req.path);
    await sendFile(res, filePath, {
      req,
      maxAge: LARGEST_POSSIBLE_MAXAGE,
      immutable: true,
    });
  } catch (err) {
    next();
  }
});

// Try to serve files from the blog folder
assets.use(async (req, res, next) => {
  const blogFolder = config.blog_folder_dir + "/" + req.blog.id;
  const decodedPath = decodeURIComponent(req.path);

  try {
    await sendFile(res, join(blogFolder, decodedPath), { req });
    return;
  } catch (e) {}

  try {
    await sendFile(res, join(blogFolder, decodedPath.toLowerCase()), { req });
    return;
  } catch (e) {}

  try {
    const pathWithCorrectCase = await caseSensitivePath(
      blogFolder,
      decodedPath
    );

    const stat = await fs.stat(pathWithCorrectCase);

    if (!stat.isFile()) throw new Error("Not a file");

    await sendFile(res, pathWithCorrectCase, { req });
    return;
  } catch (e) {}

  try {
    await sendFile(
      res,
      join(blogFolder, withoutTrailingSlash(decodedPath) + "/index.html"),
      { req }
    );
    return;
  } catch (e) {}

  try {
    await sendFile(
      res,
      join(blogFolder, withoutTrailingSlash(decodedPath) + ".html"),
      { req }
    );
    return;
  } catch (e) {}

  try {
    await sendFile(
      res,
      join(blogFolder, addLeadingUnderscore(decodedPath) + ".html"),
      { req }
    );
    return;
  } catch (e) {}

  // If we get here, none of the candidates worked
  if (!res.headersSent) {
    next();
  }
});

// Error handling
assets.use((err, req, res, next) => {
  if (err && err.message === "Not Found") {
    return next();
  }
  next(err);
});

module.exports = assets;
