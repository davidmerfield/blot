const moment = require("moment");
const config = require("config");
const Blog = require("models/blog");
const Template = require("models/template");

module.exports = function (req, res, next, handle) {
  if (!req.session || !req.user || !req.user.blogs.length) return next();
  if (!handle) return next();

  req.handle = handle;

  Blog.get({ handle }, function (err, blog) {
    if (!blog || blog.owner !== req.user.uid) return next(new Error("No blog"));

    try {
      blog = Blog.extend(blog);

      if (blog.status && blog.status.message === "Synced") {
        blog.status.state = "synced";
      }

      if (blog.status && blog.status.message !== "Synced") {
        blog.status.state = "syncing";
      }

      blog.updated = moment(blog.cacheID).fromNow();
    } catch (e) {
      return next(e);
    }

    Template.getMetadata(blog.template, function (err, metadata) {

      if (metadata) {
        res.locals.template = metadata;
        res.locals.previewURL = `https://preview-of-${metadata.owner === blog.id ? 'my-' : ''}${metadata.slug}-on-${blog.handle}.${config.host}?screenshot=true`;  
      }
      
      req.blog = blog;
      res.locals.blog = blog;
      res.locals.base = `/sites/${req.params.handle}`;
      res.locals.dashboardBase = res.locals.base; // alias for use in clients
      res.locals.breadcrumbs.add("Sites", "/sites");
      res.locals.breadcrumbs.add(req.blog.pretty.label, `${req.params.handle}`);
      res.locals.title = req.blog.pretty.label;
      next();
    });
  });
};
