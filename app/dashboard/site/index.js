var express = require("express");
var site = express.Router();
var load = require("./load");
var save = require("./save");
var trace = require("helper/trace");
const sse = require("helper/sse")({ channel: (req) => `sync:status:${req.blog.id}` });

site
  .post("/",
    trace("parsing form"),
    save.parse,
    trace("parsed form"),
    save.redirects,
    trace("saved redirects"),
    save.format,
    trace("formated form"),
    save.analytics,
    trace("saved analytics"),
    save.avatar,
    trace("saved avatar"),
    save.removeTmpFiles,
    trace("removed any tmp files"),
    save.finish
  )

site.get("/", require('./load/scheduled'));

// Load the files and folders inside a blog's folder
site.get(["/", "/folder/:path(*)"], require("./folder"));

site.get("/folder", (req, res) => {
  // redirect to client settings page
  res.redirect(`/sites/${req.params.handle}/client`);
});

site.use("/template", require("./template"));
site.use("/delete", require("./delete"));
site.use("/import", require("./import"));
site.use("/export", require("./export"));
site.use("/domain", require("./domain"));
site.use("/client", require("./client"));
site.use("/title", require("./title"));
site.use("/date", require("./date"));
site.use('/link-format', require('./link-format'));

site.get("/status", sse);

// allow the download of files directly
site.use("/folder-download/:path(*)", require('./folder/download'));

site.get("/", require('dashboard/site/load/client'), (req, res) => {
  res.render("dashboard/settings", { 
      title: req.blog.pretty.label, 
    })
});

site.get("/services", load.plugins, (req, res)=>{
  res.locals.breadcrumbs.add("Services", "services");
  res.render("dashboard/settings/services");
});

site.get("/publishing", load.plugins, (req, res)=>{
  res.locals.breadcrumbs.add("Publishing", "publishing");
  res.render("dashboard/settings/publishing");
});

site.get("/redirects", load.redirects, (req, res) => {
  res.locals.breadcrumbs.add("Redirects", "redirects");
  res.render("dashboard/settings/redirects");
});

site
  .route("/redirects/404s")
  .get(load.fourOhFour, function (req, res) {
    res.locals.breadcrumbs.add("Redirects", "redirects");
    res.locals.breadcrumbs.add("404 log", "404s");
    res.render("dashboard/settings/redirects/404s");
  })
  .post(require("./save/404"));

  site.route("/redirects/bulk")
  .get(load.redirects, function (req, res) {
    res.locals.breadcrumbs.add("Redirects", "redirects");
    res.locals.breadcrumbs.add("Bulk editor", "bulk");
    res.render("dashboard/settings/redirects/bulk");
  })

module.exports = site;