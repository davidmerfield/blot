var fs = require("fs-extra");
var ensure = require("helper/ensure");
var localPath = require("helper/localPath");
var urlNormalizer = require("helper/urlNormalizer");
var Entry = require("models/entry");
var getViewByURL = require("models/template").getViewByURL;
var isRegex = require("./util").isRegex;

// Redirects are evaluated last, after posts/pages, template views,
// built-in routes, and files in the site folder. This lookup is used
// by the dashboard to warn about rules that will never run.
//
// Cost is a handful of Redis GETs plus at most a few fs.stat calls
// per exact (non-regex) redirect — cheap enough for the settings page.

function normalizeFrom(from) {
  if (!from || typeof from !== "string") return "";

  from = from.trim();

  if (!from) return "";

  try {
    from = decodeURI(from);
  } catch (e) {
    // keep encoded form if malformed
  }

  // Full URLs are not compared against site paths
  if (from.indexOf("://") !== -1) return "";

  return urlNormalizer(from);
}

function messageFor(conflict) {
  if (!conflict) return "";

  if (conflict.type === "post") {
    return conflict.title
      ? 'This redirect won\'t run because the post "' +
          conflict.title +
          '" already exists at this URL.'
      : "This redirect won't run because a post already exists at this URL.";
  }

  if (conflict.type === "page") {
    return conflict.title
      ? 'This redirect won\'t run because the page "' +
          conflict.title +
          '" already exists at this URL.'
      : "This redirect won't run because a page already exists at this URL.";
  }

  if (conflict.type === "template") {
    return conflict.view
      ? "This redirect won't run because it matches a page in your template (" +
          conflict.view +
          ")."
      : "This redirect won't run because it matches a page in your template.";
  }

  if (conflict.type === "file") {
    return "This redirect won't run because a file in your folder exists at this URL.";
  }

  if (conflict.type === "route") {
    return conflict.label
      ? "This redirect won't run because this URL is used by " +
          conflict.label +
          "."
      : "This redirect won't run because this URL is already used by your site.";
  }

  return "This redirect won't run because it matches an existing post, page, or template URL.";
}

function withMessage(conflict) {
  if (!conflict) return null;
  conflict.message = messageFor(conflict);
  return conflict;
}

function getEntry(blogID, url) {
  return new Promise(function (resolve) {
    Entry.getByUrl(blogID, url, function (entry) {
      resolve(entry || null);
    });
  });
}

function getViewName(templateID, url) {
  return new Promise(function (resolve) {
    if (!templateID) return resolve(null);

    getViewByURL(templateID, url, function (err, viewName) {
      if (err || !viewName) return resolve(null);
      resolve(viewName);
    });
  });
}

function matchBuiltIn(url) {
  if (url === "/") {
    return { type: "route", label: "your homepage" };
  }

  if (url === "/search") {
    return { type: "route", label: "search" };
  }

  if (url === "/random" || url.indexOf("/random/") === 0) {
    return { type: "route", label: "random posts" };
  }

  if (url === "/robots.txt") {
    return { type: "route", label: "robots.txt" };
  }

  if (/^\/page\/\d+$/.test(url)) {
    return { type: "route", label: "paginated posts" };
  }

  if (/^\/tagged\//.test(url)) {
    return { type: "route", label: "tagged posts" };
  }

  return null;
}

async function existingFile(blogID, url) {
  if (!url || url === "/") return null;

  var candidates = [url];
  var lower = url.toLowerCase();

  if (lower !== url) candidates.push(lower);

  for (var i = 0; i < candidates.length; i++) {
    var path = localPath(blogID, candidates[i]);

    try {
      var stat = await fs.stat(path);
      if (stat.isFile()) return candidates[i];
    } catch (e) {
      // missing path
    }
  }

  return null;
}

async function checkOne(blog, from, viewCache) {
  var url = normalizeFrom(from);

  if (!url || isRegex(from)) return null;

  var entry = await getEntry(blog.id, url);

  if (entry && !entry.deleted && !entry.draft && !entry.scheduled) {
    return withMessage({
      type: entry.page ? "page" : "post",
      title: entry.title || "",
      url: entry.url,
    });
  }

  var builtIn = matchBuiltIn(url);

  if (builtIn) return withMessage(builtIn);

  var viewName;

  if (viewCache && viewCache.has(url)) {
    viewName = await viewCache.get(url);
  } else {
    var pending = getViewName(blog.template, url);
    if (viewCache) viewCache.set(url, pending);
    viewName = await pending;
  }

  if (viewName) {
    return withMessage({
      type: "template",
      view: viewName,
    });
  }

  var file = await existingFile(blog.id, url);

  if (file) {
    return withMessage({
      type: "file",
      path: file,
    });
  }

  return null;
}

module.exports = function (blog, redirects, callback) {
  ensure(blog, "object").and(redirects, "array").and(callback, "function");

  var viewCache = new Map();

  Promise.all(
    redirects.map(function (redirect) {
      var from = redirect && redirect.from;
      return checkOne(blog, from, viewCache).then(function (conflict) {
        if (!redirect || typeof redirect !== "object") return redirect;
        if (conflict) {
          redirect.conflict = conflict;
        } else {
          delete redirect.conflict;
        }
        return redirect;
      });
    })
  )
    .then(function (annotated) {
      callback(null, annotated);
    })
    .catch(callback);
};
