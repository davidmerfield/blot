var Entry = require("models/entry");
var normalize = require("helper/urlNormalizer");
var plugins = require("build/plugins");
var Entries = require("models/entries");
var metadataCaseInsensitive = require("helper/metadataCaseInsensitive");

var normalizeMetadataToggle = function (value) {
  if (typeof value === "undefined" || value === null) return "";
  return String(value).trim().toLowerCase();
};

module.exports = function (request, response, next) {
  
  request.log("entry: start", `path=${request.path}`);
  
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

  // Keep path shaping local (slashes + lowercase) but let Entry.getByUrl
  // handle URI decoding so all URL-decoding behavior is centralized there.
  url = url.toLowerCase();

  request.log("entry: fetching by url", `url=${url}`);
  Entry.getByUrl(blog.id, url, function (entry) {
    if (!entry || entry.deleted || entry.draft) {
      request.log("entry: not found or draft", `url=${url}`);
      return next();
    }
    request.log("entry: found", `entryId=${entry.id}`, `title=${entry.title ? entry.title.substring(0, 50) : 'untitled'}`);
  

    // If comments are enabled in settings, they are shown on all blog posts and pages
    // Disable comments in cases:
    // 1. Blog post metadata DOES have  'Comments: No'
    // 2. Page metadata DOES NOT have   'Comments: Yes'
    var metadataByLowercaseKey = metadataCaseInsensitive(entry.metadata);
    entry.metadataLowercase = metadataByLowercaseKey;
    var commentsToggle = normalizeMetadataToggle(metadataByLowercaseKey.comments);

    if (
      commentsToggle === "no" ||
      (commentsToggle !== "yes" && entry.page)
    ) {
      delete blog.plugins.disqus;
      delete blog.plugins.blueskyComments;
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
    var comparableUrl = url;

    // Canonical comparison should use a decoded form when possible so
    // encoded and plain unicode request paths are treated the same.
    try {
      comparableUrl = decodeURI(comparableUrl);
    } catch (e) {
      // keep encoded form if malformed
    }

    if (normalize(entry.url) !== normalize(comparableUrl) && comparableUrl === "/") return next();

    request.log("entry: fetching adjacent entries");
    Entries.adjacentTo(blog.id, entry.id, function (
      nextEntry,
      previousEntry,
      index
    ) {
      request.log("entry: adjacent entries fetched", `hasNext=${!!nextEntry}`, `hasPrev=${!!previousEntry}`);
      entry.next = nextEntry;
      entry.previous = previousEntry;
      entry.adjacent = !!(nextEntry || previousEntry);
      entry.index = index;

      // Ensure the user is always viewing
      // the entry at its latest and greatest URL
      // 301 passes link juice for SEO?
      if (entry.url && normalize(entry.url) !== normalize(comparableUrl)) {
        // Res.direct expects a URL, we shouldnt need
        // to do this now but OK. I feel like we're decoding
        // then recoding then decoding. I should just store
        // valid URI and skip the decoding.
        var redirect = encodeURI(entry.url);

        return response.status(301).redirect(redirect);
      }

      request.log("entry: loading plugins");
      plugins.load("entryHTML", blog.plugins, function (err, pluginHTML) {
        request.log("entry: plugins loaded");
        // Dont show plugin HTML on a draft.
        // Don't show plugin HTML on a preview subdomain.
        // This is to prevent Disqus getting stuck on one URL.
        if (entry.draft || request.preview) {
          pluginHTML = pluginHTML
            ? "<p><em>Comments are hidden on site previews.</em></p>"
            : "";
        }

        response.locals.partials.pluginHTML = pluginHTML;

        response.locals.entry = entry;

        request.log("entry: complete, rendering view");
        response.renderView("entry.html", next);
      });
    });
  });
}
