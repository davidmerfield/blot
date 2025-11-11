var PUBLIC = require("./scheme").PUBLIC;
var config = require("config");
var url = require("./url");
var protocol = "https";
var punycode = require("helper/punycode");
var imageExif = require("./util/imageExif");
var path = require("path");

module.exports = function extend(blog) {
  var pages = [];

  // External links have a timestamp
  // as their ID, pages have their entry ID
  for (var a in blog.menu)
    if (blog.menu[a].id.length < 10) pages.push(blog.menu[a]);

  // is it bad to extend the blog object here?
  blog.pretty = {};

  imageExif.apply(blog);

  if (blog.dateFormat) blog["is" + blog.dateFormat] = "selected";

  // this is a hack and should be
  if (blog.menu && blog.menu.length) {
    for (var i in blog.menu) {
      // External links have a timestamp
      // as their ID, pages have their entry ID
      if (blog.menu[i].id[0] === "/") {
        blog.menu[i].isPage = true;
      }
    }

    blog.menu[blog.menu.length - 1].last = true;
  }

  // pages are used by the sitemap.
  blog.pages = pages;
  blog.showPages = pages.length > 0;
  blog.totalPages = pages.length;

  blog.feedURL = "/feed.rss";
  blog.url = protocol + "://" + blog.handle + "." + config.host;
  
  blog.previewURL = `https://preview-of-${blog.handle}.${config.host}`;
  blog.pretty.url = blog.handle + "." + config.host;
  blog.pretty.label = blog.title || blog.pretty.url;

  if (blog.domain) {
    blog.url = protocol + "://" + blog.domain;
    blog.pretty.url = punycode.toUnicode(blog.domain);
    blog.pretty.domain = punycode.toUnicode(blog.domain);
  }

  blog.blogURL = protocol + "://" + blog.handle + "." + config.host;
  var defaultCssURL = blog.cssURL || url.css(blog.cacheID);
  var defaultScriptURL = blog.scriptURL || url.js(blog.cacheID);

  blog.cssURL = defaultCssURL;
  blog.scriptURL = defaultScriptURL;

  // Exposed to templates..
  blog.locals = {
    feedURL: blog.feedURL,
    blogURL: blog.blogURL,
    cssURL: blog.cssURL,
    scriptURL: blog.scriptURL,
  };

  blog.locals.imageExif = blog.imageExif;
  blog.locals.imageExifMode = blog.imageExifMode;
  blog.locals.isImageExifOff = blog.isImageExifOff;
  blog.locals.isImageExifBasic = blog.isImageExifBasic;
  blog.locals.isImageExifFull = blog.isImageExifFull;

  // Import blog info into
  // rendering context
  for (var x in blog) if (PUBLIC.indexOf(x) > -1) blog.locals[x] = blog[x];

  blog.applyTemplateManifest = function (manifest) {
    var manifestObject = manifest || {};
    blog.templateManifest = manifestObject;

    var cssFromManifest = manifestAssetURL(
      blog.template,
      "style.css",
      manifestObject
    );

    var scriptFromManifest = manifestAssetURL(
      blog.template,
      "script.js",
      manifestObject
    );

    blog.cssURL = cssFromManifest || defaultCssURL;
    blog.scriptURL = scriptFromManifest || defaultScriptURL;

    if (blog.locals) {
      blog.locals.cssURL = blog.cssURL;
      blog.locals.scriptURL = blog.scriptURL;
    }
  };

  if (blog.templateManifest) {
    blog.applyTemplateManifest(blog.templateManifest);
  } else {
    blog.templateManifest = {};
  }

  return blog;
};

function manifestAssetURL(templateID, viewName, manifest) {
  if (
    !manifest ||
    !templateID ||
    !Object.prototype.hasOwnProperty.call(manifest, viewName)
  )
    return null;

  var hash = manifest[viewName];
  if (!hash) return null;

  var ext = path.extname(viewName) || "";
  var encodedTemplate = encodeURIComponent(templateID);
  var encodedView = viewName
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");

  return (
    config.cdn.origin +
    "/view/" +
    encodedTemplate +
    "/" +
    encodedView +
    "/v-" +
    hash +
    ext
  );
}
