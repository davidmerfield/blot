const ERROR = require("./error");
const loadEntries = require("./load");
const finalRender = require("./main");
const retrieve = require("./retrieve");
const getCachedFullView = require("./full-view-cache");

const ensure = require("helper/ensure");
const extend = require("helper/extend");
const getTemplateSortOptions = require("blog/sortOptions");
const config = require("config");
const fromCloudflare = require("../lib/fromCloudflare");

const replaceFolderLinks = require("./replaceFolderLinks/html");
const replaceFolderLinksCSS = require("./replaceFolderLinks/css");

const CACHE = config.cache;
const CONTENT_TYPE = "Content-Type";
const CACHE_CONTROL = "Cache-Control";
const cacheDuration = "public, max-age=31536000";
const JS = "text/javascript";
const STYLE = "text/css";

const PREVIEW_POST_MESSAGE_SCRIPT =
  "<script>window.onload = function() {window.top.postMessage('iframe:' +  window.location.pathname, '*');};</script></body>";
const PREVIEW_RELOAD_SCRIPT =
  "<script>new EventSource('/__blot/preview/reload').onmessage = function() { window.location.reload(); };</script></body>";

async function loadView({ blog, template, viewName }) {
  return getCachedFullView({ blog, template, viewName });
}

function mergeLocals(req, res, view) {
  const query = Object.keys(req.query).length ? { query: req.query } : {};

  // first-wins: res.locals ← query object ← view.locals ← template.locals ← blog.locals
  extend(res.locals)
    .and(query)
    .and(view.locals)
    .and(req.template.locals)
    .and(req.blog.locals);

  // Templates may configure sorting as nested `sort: { by, direction }`.
  // Expose the resolved selection as flat sort_by / sort_order so views
  // (e.g. Hypertext's navigation) don't have to re-derive it.
  if (req.template.locals && req.template.locals.sort) {
    const resolvedSort = getTemplateSortOptions(req.template.locals);
    if (resolvedSort.sortBy !== undefined)
      res.locals.sort_by = resolvedSort.sortBy;
    if (resolvedSort.order !== undefined)
      res.locals.sort_order = resolvedSort.order;
  }

  extend(res.locals.partials).and(view.partials);
}

async function retrieveLocals(req, res, needed) {
  const foundLocals = await retrieve(req, res, needed);
  extend(res.locals).and(foundLocals);
}

async function augmentEntries(req, res) {
  await loadEntries(req, res);
}

function renderMustache(content, locals, partials) {
  return finalRender(content, locals, partials);
}

async function rewriteOutput(req, blog, viewType, output) {
  const cloudflare = fromCloudflare(req);

  // Replace protocol of CDN links for requests served over HTTP
  if (
    viewType.indexOf("text/") > -1 &&
    req.protocol === "http" &&
    cloudflare === false &&
    output.indexOf(config.cdn.origin) > -1
  ) {
    output = output
      .split(config.cdn.origin)
      .join(config.cdn.origin.split("https://").join("http://"));
  }

  if (viewType === "text/html" && !req.preview) {
    req.log("Replacing folder links with CDN links");
    output = await replaceFolderLinks(blog, output, req.log);
    req.log("Replaced folder links with CDN links");
  } else if (viewType === "text/css" && !req.preview) {
    req.log("Replacing folder links with CDN links");
    output = await replaceFolderLinksCSS(blog, output, req.log);
    req.log("Replaced folder links with CDN links");
  }

  return output;
}

function injectPreviewScripts(output) {
  output = output.split("</body>").join(PREVIEW_POST_MESSAGE_SCRIPT);
  return output.split("</body>").join(PREVIEW_RELOAD_SCRIPT);
}

// load → merge → retrieve → augment → render → rewrite
// Does not set headers, send the response, or inject preview scripts.
async function renderToString(req, res, name) {
  ensure(name, "string");

  if (!req.template) return { noTemplate: true };

  const blog = req.blog;
  const templateID = req.template.id;

  const view = await loadView({
    blog,
    template: req.template,
    viewName: name,
  });

  if (!view) {
    const err = new Error(
      `The view '${name}' does not exist under templateID=${templateID}`
    );
    err.code = "NO_VIEW";
    throw err;
  }

  req.log("Loaded view");

  mergeLocals(req, res, view);
  await retrieveLocals(req, res, view.retrieve);

  try {
    await augmentEntries(req, res);
  } catch (e) {
    throw ERROR.BAD_LOCALS();
  }

  req.log("Loaded other locals");

  // This is a public inspection interface for public blog pages. Its
  // output intentionally includes partials, template and blog locals,
  // and rendered published-entry data: Blot treats everything in the
  // public render context as public. Never put credentials, private
  // account data, unpublished entries, or other secrets in res.locals.
  // Keep this response no-cache and public (not preview-only) unless
  // Blot's public-template policy changes.
  if (req.query && (req.query.debug || req.query.json)) {
    return { json: true, locals: res.locals, viewType: view.type };
  }

  let output;

  try {
    output = renderMustache(view.content, res.locals, res.locals.partials);
  } catch (e) {
    throw ERROR.BAD_LOCALS();
  }

  output = await rewriteOutput(req, blog, view.type, output);

  return { output, viewType: view.type, locals: res.locals };
}

async function respond(req, res, result) {
  const blog = req.blog;

  if (result.json) {
    res.set("Cache-Control", "no-cache");
    return res.json(result.locals);
  }

  let output = result.output;
  const viewType = result.viewType;

  // We need to persist the page shown on the preview inside the
  // template editor. To do this, we send the page viewed to the
  // parent window (i.e. the page which embeds the preview in an
  // iframe). If we can work out how to do this in a cross origin
  // fashion with injecting a script, then remove this.
  if (req.preview && viewType === "text/html") {
    output = injectPreviewScripts(output);
  }

  // Only cache JavaScript and CSS if the request is not to a preview
  // subdomain and Blot's caching is turned on.
  if (CACHE && !req.preview && (viewType === STYLE || viewType === JS)) {
    res.header(CACHE_CONTROL, cacheDuration);
  }

  req.log("Sending response");
  res.header(CONTENT_TYPE, viewType);
  // This lets browsers send 'If-Modified-Since' requests
  // to check if the page has changed since the last time
  res.header("Last-Modified", new Date(blog.cacheID).toUTCString());
  res.send(output);
}

async function sendView(req, res, name, next) {
  ensure(name, "string").and(next, "function");

  try {
    const result = await renderToString(req, res, name);
    if (result.noTemplate) return next();
    await respond(req, res, result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  loadView,
  mergeLocals,
  retrieveLocals,
  augmentEntries,
  renderMustache,
  rewriteOutput,
  renderToString,
  sendView,
};
