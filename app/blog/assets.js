const config = require("config");
const mime = require("mime-types");
const async = require("async");
const debug = require("debug")("blot:blog:assets");
const { join, basename, dirname } = require("path");
const LARGEST_POSSIBLE_MAXAGE = 86400000;
const { promisify } = require("util");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));
const BANNED_ROUTES = ["/.git"];
const fs = require("fs-extra");

const express = require("express");
const assets = express.Router();

// find data/static/*/. -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -u
// _assets
// _avatars
// _bookmark_screenshots
// _image_cache
// _thumbnails

assets.use(function (req, res, next) {
  // Catch and return 404 for directory-traversal attacks
  if (req.path.indexOf("..") > -1) {
    return next(new Error("Not Found"));
  }

  // Skip serving files for banned routes
  if (BANNED_ROUTES.find((route) => req.path.toLowerCase().startsWith(route))) {
    return next(new Error("Not Found"));
  }

  next();
});

assets.use(async function (req, res, next) {
  console.log("Serving asset", req.path);

  try {
    const pathWithCorrectCase = await caseSensitivePath(
      config.blog_folder_dir + "/" + req.blog.id,
      decodeURIComponent(req.path)
    );

    // check the path is a file not a directory
    const stat = await fs.stat(pathWithCorrectCase);

    if (pathWithCorrectCase && stat.isFile()) {
      var options = {
        maxAge: 0,
        dotfiles: "allow",
        headers: {
          "Content-Type": getContentType(pathWithCorrectCase),
        },
      };

      if (!options.maxAge && !req.query.cache && !req.query.extension) {
        options.headers["Cache-Control"] = "no-cache";
      }

      if (req.query.cache && req.query.extension) {
        options.maxAge = LARGEST_POSSIBLE_MAXAGE;
      }

      console.log("Serving file", pathWithCorrectCase, options);
      return res.sendFile(pathWithCorrectCase, options, next);
    }
  } catch (e) {
    console.log("Error serving file", e);
  }

  // We check to see if the requests path
  // matches a file in the following directories
  const roots = [
    // Blog directory /blogs/$id
    { root: config.blog_folder_dir + "/" + req.blog.id },

    // Static directory /static/$id
    {
      root: config.blog_static_files_dir + "/" + req.blog.id,
      maxAge: LARGEST_POSSIBLE_MAXAGE,
    },

    // Global static directory
    {
      root: __dirname + "/static",
      maxAge: LARGEST_POSSIBLE_MAXAGE,
    },
  ];

  // decodeURIComponent maps something like
  // "/Hello%20World.txt" to "/Hello World.txt"
  // Express does not do this for us.
  const paths = [
    // First we try the actual path
    decodeURIComponent(req.path),

    // Then the lowercase path
    decodeURIComponent(req.path).toLowerCase(),

    // The path plus an index file
    withoutTrailingSlash(decodeURIComponent(req.path)) + "/index.html",

    // The path plus .html
    withoutTrailingSlash(decodeURIComponent(req.path)) + ".html",

    // The path with leading underscore and with trailing .html
    addLeadingUnderscore(decodeURIComponent(req.path)) + ".html",
  ];

  let candidates = [];

  roots.forEach(function (options) {
    paths.forEach(function (path) {
      candidates.push({
        options: options,
        path: path,
      });
    });
  });

  candidates = candidates.map(function (candidate) {
    return function (next) {
      debug("Attempting", candidate);
      var headers = {
        "Content-Type": getContentType(candidate.path),
      };

      var options = {
        root: candidate.options.root,
        maxAge: candidate.options.maxAge || 0,
        headers: headers,
      };

      if (!options.maxAge && !req.query.cache && !req.query.extension) {
        headers["Cache-Control"] = "no-cache";
      }

      if (req.query.cache && req.query.extension) {
        options.maxAge = LARGEST_POSSIBLE_MAXAGE;
      }

      res.sendFile(candidate.path, options, next);
    };
  });

  async.tryEach(candidates, function () {
    // Is this still neccessary?
    if (res.headersSent) return;

    next();
  });
});

function addLeadingUnderscore(path) {
  path = withoutTrailingSlash(decodeURIComponent(path));
  return join(dirname(path), "_" + basename(path));
}

function withoutTrailingSlash(path) {
  if (path && path.slice(-1) === "/") return path.slice(0, -1);
  return path;
}

function getContentType(path) {
  // If we can't determine a mime type for a given path,
  // assume it is HTML if we are responding to a request
  // for a directory, or an octet stream otherwise...
  var default_mime =
    path.indexOf(".") > -1 ? "application/octet-stream" : "text/html";

  var result = mime.contentType(mime.lookup(path) || default_mime);

  // remap application/mp4 -> video/mp4
  if (result === "application/mp4") {
    result = "video/mp4";
  }

  return result;
}

// Swallow 404 errors and pass all other errors to the next middleware
assets.use(function (err, req, res, next) {
  if (err && err.message === "Not Found") {
    next();
  } else {
    next(err);
  }
});

module.exports = assets;
