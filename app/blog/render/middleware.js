const ERROR = require("./error");
const loadView = require("./load");
const finalRender = require("./main");
const retrieve = require("./retrieve");
const getCachedFullView = require("./full-view-cache");
const getTemplateOutputCache = require("./template-output-cache");

const ensure = require("helper/ensure");
const extend = require("helper/extend");
const getTemplateSortOptions = require("blog/sortOptions");
const callOnce = require("helper/callOnce");
const config = require("config");
const fromCloudflare = require("../lib/fromCloudflare");
const CACHE = config.cache;

const CONTENT_TYPE = "Content-Type";
const CACHE_CONTROL = "Cache-Control";

const replaceFolderLinks = require("./replaceFolderLinks/html");
const replaceFolderLinksCSS = require("./replaceFolderLinks/css");
const BLOT_CDN_TOKEN = require("./replaceFolderLinks/cdnToken");

const cacheDuration = "public, max-age=31536000";
const JS = "text/javascript";
const STYLE = "text/css";

module.exports = function attachRenderView(req, res, _next) {
  res.renderView = render;
  return _next();

  async function render(name, next, callback) {
    ensure(name, "string").and(next, "function");

    if (!req.template) return next();

    const blog = req.blog;
    const templateID = req.template.id;
    const cloudflare = fromCloudflare(req);

    if (callback) callback = callOnce(callback);

    try {
      const response = await getCachedFullView({
        blog,
        template: req.template,
        viewName: name,
      });

      if (!response) {
        const err = new Error(
          `The view '${name}' does not exist under templateID=${templateID}`
        );
        err.code = "NO_VIEW";
        return next(err);
      }

      req.log("Loaded view");

      const viewLocals = response[0];
      const viewPartials = response[1];
      const missingLocals = response[2];
      const viewType = response[3];
      const view = response[4];
      const query = Object.keys(req.query).length ? { query: req.query } : {};

      extend(res.locals)
        .and(query)
        .and(viewLocals)
        .and(req.template.locals)
        .and(blog.locals);

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

      extend(res.locals.partials).and(viewPartials);

      const foundLocals = await retrieve(req, res, missingLocals);
      extend(res.locals).and(foundLocals);

      try {
        await loadView(req, res);
      } catch (e) {
        return next(ERROR.BAD_LOCALS());
      }

      req.log("Loaded other locals");

      const locals = res.locals;
      const partials = res.locals.partials;

      // This is a public inspection interface for public blog pages. Its
      // output intentionally includes partials, template and blog locals,
      // and rendered published-entry data: Blot treats everything in the
      // public render context as public. Never put credentials, private
      // account data, unpublished entries, or other secrets in res.locals.
      // Keep this response no-cache and public (not preview-only) unless
      // Blot's public-template policy changes.
      if (req.query && (req.query.debug || req.query.json)) {
        if (callback) return callback(null, res.locals);
        res.set("Cache-Control", "no-cache");
        return res.json(res.locals);
      }

      // Renders the view and, for HTML, resolves its folder links. For CSS/
      // JS this is the thunk passed to the template-output-cache: on a
      // cache hit, none of this runs at all.
      const computeOutput = async () => {
        let computed;

        try {
          computed = finalRender(view, locals, partials);
        } catch (e) {
          throw ERROR.BAD_LOCALS();
        }

        if (viewType === "text/html" && !req.preview) {
          req.log("Replacing folder links with CDN links");
          computed = await replaceFolderLinks(blog, computed, req.log);
          req.log("Replaced folder links with CDN links");
        } else if (viewType === STYLE && !req.preview) {
          req.log("Replacing folder links with CDN links");
          computed = await replaceFolderLinksCSS(blog, computed, req.log);
          req.log("Replaced folder links with CDN links");
        }

        return computed;
      };

      let output;

      // CSS/JS output is fully determined by {blogID, cacheID, templateID,
      // viewName} - the same key full-view-cache.js already uses - so it's
      // safe to skip both the Mustache render and (for CSS) the folder-link
      // resolution on a cache hit. HTML keeps its per-request path: per-
      // request locals/query/pagination make it unsafe to cache this way.
      if ((viewType === STYLE || viewType === JS) && !req.preview) {
        output = await getTemplateOutputCache({
          blog,
          template: req.template,
          viewName: name,
          compute: computeOutput,
        });
      } else {
        output = await computeOutput();
      }

      // Replace protocol of CDN links for requests served over HTTP. This
      // is the separate, pre-existing {{cdn}}/{{public}} template-helper
      // case, which hardcodes config.cdn.origin directly - it must stay
      // outside the cached compute() above since it depends on the
      // requesting protocol, not on {blogID, cacheID, templateID, viewName}.
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

      // Resolve the %%BLOT_CDN%% token baked into build-time-baked entry
      // HTML (app/build/plugins/folderAssets) and render-time-cached
      // template CSS/JS (getTemplateOutputCache above) into the real CDN
      // origin. This must run unconditionally - after the cache lookup,
      // hit or miss, and for both the callback path (e.g. CDN manifest
      // generation) and the normal response path below - since it's the
      // one place every path converges. This is also the natural future
      // hook for CDN white-labeling / same-host routing: only this
      // resolution step would need to change.
      if (output.indexOf(BLOT_CDN_TOKEN) > -1) {
        let cdnOrigin = config.cdn.origin;

        if (req.protocol === "http" && cloudflare === false) {
          cdnOrigin = cdnOrigin.split("https://").join("http://");
        }

        output = output.split(BLOT_CDN_TOKEN).join(cdnOrigin);
      }

      if (callback) {
        return callback(null, output);
      }

      // We need to persist the page shown on the preview inside the
      // template editor. To do this, we send the page viewed to the
      // parent window (i.e. the page which embeds the preview in an
      // iframe). If we can work out how to do this in a cross origin
      // fashion with injecting a script, then remove this.
      if (req.preview && viewType === "text/html") {
        output = output
          .split("</body>")
          .join(
            "<script>window.onload = function() {window.top.postMessage('iframe:' +  window.location.pathname, '*');};</script></body>"
          );

        // Reload the preview whenever the blog's folder finishes syncing
        // and its rendered output actually changed. See the "reload" event
        // published in sync/index.js and streamed by
        // blog/routes/preview-reload.js.
        output = output
          .split("</body>")
          .join(
            "<script>new EventSource('/__blot/preview/reload').onmessage = function() { window.location.reload(); };</script></body>"
          );
      }

      // Only cache JavaScript and CSS if the request is not to a preview
      // subdomain and Blot's caching is turned on.
      if (CACHE && !req.preview && (viewType === STYLE || viewType === JS)) {
        res.header(CACHE_CONTROL, cacheDuration);
      }

      try {
        req.log("Sending response");
        res.header(CONTENT_TYPE, viewType);
        // This lets browsers send 'If-Modified-Since' requests
        // to check if the page has changed since the last time
        res.header("Last-Modified", new Date(blog.cacheID).toUTCString());
        res.send(output);
      } catch (e) {
        next(e);
      }
    } catch (err) {
      return next(err);
    }
  }
};
