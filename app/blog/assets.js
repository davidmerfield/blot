const assertNoSymlinks = require("helper/assertNoSymlinks");
const config = require("config");
const express = require("express");
const mime = require("mime-types");
const { join, basename, dirname } = require("path");
const { promisify } = require("util");
const fs = require("fs-extra");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));

// Constants
const LARGEST_POSSIBLE_MAXAGE = 86400000;

const GLOBAL_STATIC_FILES = config.blot_directory + "/app/blog/static";
const GLOBAL_STATIC_SUBDIRECTORIES = ["/fonts", "/icons", "/katex", "/plugins"];

// We always return 404 for requests which contain these patterns
const BLOCKED_PATTERNS = [
  "..", // parent directory traversal
  ".php", // blot does not support PHP
  "/.git", // avoid exposing git directories
  "\0", // null byte
];

const BLOG_STATIC_PATHS = [
  "/_assets",
  "/_avatars",
  "/_bookmark_screenshots",
  "/_image_cache",
  "/_thumbnails",
];

// Router setup
const assets = express.Router();

// Security middleware
assets.use((req, res, next) => {
  req.log("assets: security check", `path=${req.path}`);
  if (
    BLOCKED_PATTERNS.some(
      (pattern) =>
        req.path.includes(pattern) ||
        decodeURIComponent(req.path).includes(pattern)
    )
  ) {
    req.log("assets: blocked pattern detected");
    return next(new Error("Not Found"));
  }
  next();
});

// Global static files
GLOBAL_STATIC_SUBDIRECTORIES.forEach((dir) => {
  assets.use(dir, express.static(GLOBAL_STATIC_FILES + dir, { maxAge: "1y" }));
});

assets.get("/html2canvas.min.js", async (req, res, next) => {
  try {
    await sendFile(GLOBAL_STATIC_FILES + "/html2canvas.min.js", {
      req,
      res,
      maxAge: LARGEST_POSSIBLE_MAXAGE,
      immutable: true,
    });
  } catch (err) {
    next();
  }
});

assets.get("/layout.css", async (req, res, next) => {
  try {
    await sendFile(GLOBAL_STATIC_FILES + "/layout.css", {
      req,
      res,
      maxAge: LARGEST_POSSIBLE_MAXAGE,
      immutable: true,
    });
  } catch (err) {
    next();
  }
});

// Blog-specific static assets
assets.use(BLOG_STATIC_PATHS, async (req, res, next) => {
  req.log("assets: blog static path", `baseUrl=${req.baseUrl}`, `path=${req.path}`);
  try {
    const filePath =
      config.blog_static_files_dir + "/" + req.blog.id + req.baseUrl + decodeURIComponent(req.path);
    req.log("assets: serving blog static file", `filePath=${filePath}`);
    await sendFile(filePath, {
      req,
      res,
      maxAge: LARGEST_POSSIBLE_MAXAGE,
      immutable: true,
    });
    req.log("assets: blog static file served");
  } catch (err) {
    req.log("assets: blog static file not found");
    next();
  }
});

// Try to serve files from the blog folder
assets.use(async (req, res, next) => {
  const blogFolder = config.blog_folder_dir + "/" + req.blog.id;
  const decodedPath = decodeURIComponent(req.path);
  
  req.log("assets: blog folder lookup", `path=${decodedPath}`);

  try {
    await sendFile(join(blogFolder, decodedPath), { req, res });
    req.log("assets: served exact path");
    return;
  } catch (e) {}

  try {
    await sendFile(join(blogFolder, decodedPath.toLowerCase()), { req, res });
    req.log("assets: served lowercase path");
    return;
  } catch (e) {}

  try {
    const pathWithCorrectCase = await caseSensitivePath(
      blogFolder,
      decodedPath
    );

    const stat = await fs.stat(pathWithCorrectCase);

    if (!stat.isFile()) throw new Error("Not a file");

    await sendFile(pathWithCorrectCase, { req, res });
    req.log("assets: served case-corrected path");
    return;
  } catch (e) {}

  try {
    await sendFile(
      join(blogFolder, withoutTrailingSlash(decodedPath) + "/index.html"),
      { req, res }
    );
    req.log("assets: served index.html");
    return;
  } catch (e) {}

  try {
    await sendFile(
      join(blogFolder, withoutTrailingSlash(decodedPath) + "/_index.html"),
      { req, res }
    );
    req.log("assets: served _index.html");
    return;
  } catch (e) {}

  try {
    await sendFile(
      join(blogFolder, withoutTrailingSlash(decodedPath) + ".html"),
      { req, res }
    );
    req.log("assets: served .html extension");
    return;
  } catch (e) {}

  try {
    await sendFile(
      join(blogFolder, addLeadingUnderscore(decodedPath) + ".html"),
      { req, res }
    );
    req.log("assets: served underscore prefixed .html");
    return;
  } catch (e) {}

  // If we get here, none of the candidates worked
  if (!res.headersSent) {
    req.log("assets: no file found, passing to next middleware");
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

function withoutTrailingSlash(path) {
  return path && path.slice(-1) === "/" ? path.slice(0, -1) : path;
}

function addLeadingUnderscore(path) {
  path = withoutTrailingSlash(decodeURIComponent(path));
  return join(dirname(path), "_" + basename(path));
}

async function sendFile(path, { req, res, maxAge = 0, immutable = false } = {}) {
  // Static app assets also use this function; only blog-folder paths need
  // the blog's no-symlink policy, including every ancestor within that root.
  const blogRoot = req?.blog && join(config.blog_folder_dir, req.blog.id);
  if (blogRoot && (path === blogRoot || path.startsWith(blogRoot + "/"))) {
    await assertNoSymlinks(blogRoot, path);
  }
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

module.exports = assets;
