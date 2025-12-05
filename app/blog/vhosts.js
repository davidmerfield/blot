var Blog = require("models/blog");
var config = require("config");

module.exports = function (req, res, next) {

  req.log("Loading blog");

  var identifier, handle, redirect, previewTemplate, err;
  var host = req.get("host");
  var hostname = host && host.split(":").shift();

  // We have a special case for Cloudflare
  // because some of their SSL settings insist on fetching
  // from the origin server (in this case Blot) over HTTP
  // which causes a redirect loop when we try to redirect
  // to HTTPS. This is a workaround.
  var fromCloudflare =
    Object.keys(req.headers || {})
      .map(key => key.trim().toLowerCase())
      .find(key => key.startsWith("cf-")) !== undefined;

  // The request is missing a host header
  if (!host) {
    err = new Error("No blog");
    err.code = "ENOENT";
    return next(err);
  }

  // Cache the original host for use in templates
  // this should be req.locals.originalHost
  req.originalHost = host;

  handle = extractHandle(hostname);

  if (handle) {
    identifier = { handle: handle };
  } else {
    // strip port if present, this is required by test suite
    // and is a good idea in general
    identifier = { domain: hostname };
  }

  Blog.get(identifier, function (err, blog) {
    if (err) {
      return next(err);
    }

    if (!blog || blog.isDisabled || blog.isUnpaid) {
      err = new Error("No blog");
      err.code = "ENOENT";
      return next(err);
    }

    previewTemplate = extractPreviewTemplate(hostname, blog.id);

    // Probably a www -> apex redirect
    if (identifier.domain && blog.domain !== identifier.domain)
      redirect = req.protocol + "://" + blog.domain + req.originalUrl;

    // Redirect old handle
    if (identifier.handle && blog.handle !== identifier.handle)
      redirect =
        req.protocol +
        "://" +
        blog.handle +
        "." +
        config.host +
        req.originalUrl;

    // Redirect Blot subdomain to custom domain we use
    // 302 temporary since the domain might break in future
    if (
      identifier.handle &&
      blog.domain &&
      blog.redirectSubdomain &&
      !previewTemplate
    )
      return res
        .status(302)
        .redirect(req.protocol + "://" + blog.domain + req.originalUrl);

    // Redirect HTTP to HTTPS. Preview subdomains are not currently
    // available over HTTPS but when they are, remove this.
    if (
      blog.forceSSL &&
      req.protocol === "http" &&
      !previewTemplate &&
      fromCloudflare === false
    )
      redirect = "https://" + host + req.originalUrl;

    // Should we be using 302 temporary for this?
    if (redirect) return res.status(301).redirect(redirect);

    // Retrieve the name of the template from the host
    // If the request came from a preview domain
    // e.g preview.original.david.blot.im
    if (previewTemplate) {
      // Necessary to allow the template editor to embed the page
      res.removeHeader("X-Frame-Options");
      res.removeHeader("Content-Security-Policy");

      req.preview = true;
      res.set("Cache-Control", "no-cache");

      // construct the template ID
      blog.template = previewTemplate;

      // don't use the deployed asset for preview subdomains
      blog.cssURL = Blog.url.css(blog.cacheID);
      blog.scriptURL = Blog.url.js(blog.cacheID);
    } else {
      req.preview = false;
    }

    // Load in pretty and shit...
    // this must follow preview
    // since cssURL and scriptURL
    // for subdomains.
    blog = Blog.extend(blog);

    blog.locals = blog.locals || {};

    // Store the original request's url so templates {{blogURL}}
    blog.locals.blogURL = req.protocol + "://" + req.originalHost;
    blog.locals.siteURL = "https://" + config.host;

    // Store the blog's info so routes can access it
    req.blog = blog;

    req.log("loaded blog");
    return next();
  });
};

function matchingBaseHost(host) {
  if (!host) return false;

  return config.hosts.find((baseHost) => {
    if (!baseHost) return false;
    return host === baseHost || host.endsWith("." + baseHost);
  });
}

function extractHandle (host) {
  const baseHost = matchingBaseHost(host);
  if (!baseHost || host === baseHost) return false;

  let handle = host
    .slice(0, -baseHost.length - 1)
    .split(".")
    .pop();

  // Follows the new convention for preview subdomains, e.g.
  // preview-of-$template-on-$handle.$host e.g.
  // preview-of-diary-on-news.blot.im
  if (handle.indexOf("-") > -1) handle = handle.split("-").pop();

  return handle;
}

function extractPreviewTemplate (host, blogID) {
  const baseHost = matchingBaseHost(host);
  if (!baseHost || host === baseHost) return false;

  var subdomains = host.slice(0, -baseHost.length - 1).split(".");
  var handle = subdomains.pop();
  var prefix = subdomains.shift();

  // Follows the new convention for preview subdomains, e.g.
  // preview-of-$template-on-$handle.$host e.g.
  // preview-of-diary-on-news.blot.im
  if (handle.indexOf("-") > -1 && handle.indexOf("preview-of-") === 0) {
    let owner;
    let templateName;

    if (handle.indexOf("preview-of-my-") === 0) {
      owner = blogID;
      templateName = handle
        .slice("preview-of-my-".length)
        .split("-on-")
        .shift();
    } else {
      templateName = handle.slice("preview-of-".length).split("-on-").shift();
      owner = "SITE";
    }

    return `${owner}:${templateName}`;
  }

  if (!subdomains || !subdomains.length || prefix !== "preview") return false;

  var name = subdomains.pop();
  var isBlots = !subdomains.pop();

  if (host === handle + "." + baseHost) return false;

  var owner = isBlots ? "SITE" : blogID;

  return owner + ":" + name;
}

// for testing in tests/vhosts.js
module.exports.extractHandle = extractHandle;
module.exports.extractPreviewTemplate = extractPreviewTemplate;
module.exports.isSubdomain = isSubdomain;
