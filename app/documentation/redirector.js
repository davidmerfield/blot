const Express = require("express");
const redirector = new Express.Router();

const internal = {
  "/dashboard": "/sites",
  "/account": "/sites/account",
  "/settings": "/sites/settings",
  "/log-in": "/sites/log-in",
  "/sign-up": "/sites/sign-up",
  "/notes": "/about/notes",
  "/about/news": "/news",
  "/about/source-code": "/source-code",
  "/help": "/how",
  "/how/drafts": "/how/posts/drafts",
  "/how/pages": "/how/posts/pages",
  "/how/metadata": "/how/posts/metadata",
  "/how/import": "/how/configure/import",
  "/how/tags": "/how/posts/metadata",
  "/how/files/embedding": "/how/formatting/embedding",
  "/how/files/citations": "/how/formatting/citations",
  "/how/files/tex": "/how/formatting/tex",
  "/how/files/wikilinks": "/how/formatting/wikilinks",
  "/how/files/layout-tags": "/how/formatting/layout-tags",
  "/how/posts": "/how/files",
  "/about/contact": "/contct",
  "/about/notes/business/unlimited-bandwidth":
    "/about/notes/business/principles",
  "/about/notes/business/technique": "/about/notes/business/tools",
  "/about/notes/programming/technique": "/about/notes/programming/tools",
  "/about/notes/design/technique": "/about/notes/design/tools",
  "/about/notes/business/project-management": "/about/notes/business/tools",
  "/about/notes/design/aesthetic": "/about/notes/design/principles",
  "/about/notes/design/irritating-websites": "/about/notes/design/principles",
  "/updates": "/news",
  "/developers/support": "/contact",
  "/source": "/about/source-code",
  "/metadata": "/how/posts/metadata",
  "/publishing": "/how",
  "/404s": "/how/configure/redirects",
  "/howto": "/how",
  "/support": "/contact",
  "/templates/diary": "/templates/blog",
  "/templates/essay": "/templates/portfolio",
  "/templates/picture": "/templates/photo",
  "/templates/scrapbook": "/templates/reference",
  "/templates/developers/guides": "/developers/tutorials",
  "/templates/developers/reference/blog": "/developers/reference",
  "/templates/developers/reference/lists": "/developers/reference",
  "/templates/developers/reference/helper-functions": "/developers/reference",
  "/templates/developers/reference/entry": "/developers/reference",
  "/templates/developers/reference/date-tokens": "/developers/reference",
  "/templates/developers/rendering-templates":
    "/developers/tutorials/how-blot-works",
  "/templates/developers/how-blot-works":
    "/developers/tutorials/how-blot-works",
  "/about/notes/programming/development-environment":
    "/developers/tutorials/set-up-development-environment",
  "/how/templates": "/templates",
  "/how/dates": "/how/posts/metadata",
  "/developers/documentation": "/developers",
  "/templates/developers/tutorials/json-feed": "/developers/tutorials",
  "/templates/developers": "/developers",
  "/how/guides": "/how/posts",
  "/how/clients": "/how/sync",
  "/how/publishing-with-blot": "/how",
  "/how/configure/urls": "/how/configure/link-format",
  "/how/configuring": "/how/configure",
  "/how/formatting": "/how/guides",
  "/how/format": "/how/posts",
  "/how/posts/text-and-markdown": "/how/posts/markdown",
  "/how/posts/domain": "/how/configure/domain",
  "/how/posts/comments": "/how/configure/comments",
  "/formatting": "/how/posts",
  "/redirects": "/how/configure/redirects",
  "/configuring": "/how/configure"
};

const external = {
  "/typeset": "https://typeset.lllllllllllllllll.com/"
};

Object.keys(internal).forEach(from => {
  redirector.use(from, function (req, res) {
    let to = internal[from];
    let redirect = req.originalUrl.replace(from, to);
    // By default, res.redirect returns a 302 status
    // code (temporary) rather than 301 (permanent)
    res.redirect(301, redirect);
  });
});

Object.keys(external).forEach(from => {
  redirector.use(from, function (req, res) {
    // By default, res.redirect returns a 302 status
    // code (temporary) rather than 301 (permanent)
    res.redirect(301, external[from]);
  });
});

module.exports = redirector;
