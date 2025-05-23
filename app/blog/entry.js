var Entry = require("models/entry");
var normalize = require("helper/urlNormalizer");
var plugins = require("build/plugins");
var Entries = require("models/entries");

module.exports = function (request, response, next) {
  
  request.log("Loading entry");
  
  var scheduled = !!request.query.scheduled;
  var blog = request.blog;

  // we use request.path as opposed to request.url
  // because we don't care about the query string.
  // perhaps entry.getByURL should be responsible
  // for stripping the query string?
  var url = request.path;

  // remove trailing slash
  if (url.slice(-1) === "/") url = url.slice(0, -1);

  // add leading slash
  if (url[0] !== "/") url = "/" + url;

  url = decodeURIComponent(url);
  url = url.toLowerCase();

  Entry.getByUrl(blog.id, url, function (entry) {
    if (!entry || entry.deleted || entry.draft) return next();

    // If comments are enabled in settings, they are shown on all blog posts and pages
    // Disable comments in cases:
    // 1. Blog post metadata DOES have  'Comments: No'
    // 2. Page metadata DOES NOT have   'Comments: Yes'
    if (
      entry.metadata.comments === "No" ||
      (entry.metadata.comments !== "Yes" && entry.page)
    ) {
      delete blog.plugins.commento;
      delete blog.plugins.disqus;
    }

    // Redirect this entry to the file from which it was generated
    // I use this when debugging user blogs.
    if (entry.path && request.query && request.query.source && request.query.source === "true")
      return response.redirect(entry.path);

    if (entry.scheduled && !scheduled) return next();

    // We check if the url is not the site's index page
    // since it's possible to accidentally set an entry's
    // permalink to this, then never be able to undo it
    // otherwise. Thanks to Jack for discovering this fun bug.
    // We really should check that this URL is not used by
    // any of the template views but will do that in future.
    if (normalize(entry.url) !== normalize(url) && url === "/") return next();

    Entries.adjacentTo(blog.id, entry.id, function (
      nextEntry,
      previousEntry,
      index
    ) {
      entry.next = nextEntry;
      entry.previous = previousEntry;
      entry.adjacent = !!(nextEntry || previousEntry);
      entry.index = index;

      // Ensure the user is always viewing
      // the entry at its latest and greatest URL
      // 301 passes link juice for SEO?
      if (entry.url && normalize(entry.url) !== normalize(url)) {
        // Res.direct expects a URL, we shouldnt need
        // to do this now but OK. I feel like we're decoding
        // then recoding then decoding. I should just store
        // valid URI and skip the decoding.
        var redirect = encodeURI(entry.url);

        return response.status(301).redirect(redirect);
      }

      plugins.load("entryHTML", blog.plugins, function (err, pluginHTML) {
        // Dont show plugin HTML on a draft.
        // Don't show plugin HTML on a preview subdomain.
        // This is to prevent Disqus getting stuck on one URL.
        if (entry.draft || request.preview) {
          pluginHTML = "";
        }

        response.locals.partials.pluginHTML = pluginHTML;

        response.locals.entry = entry;

        request.log("Loaded entry");
        response.renderView("entry.html", next);
      });
    });
  });
}
