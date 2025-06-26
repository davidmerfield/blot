var authenticate = require("./authenticate");
var create = require("./create");
var database = require("./database");
var disconnect = require("./disconnect");
var pushover = require("pushover");
var sync = require("./sync");
var dataDir = require("./dataDir");
var repos = pushover(dataDir, { autoCreate: true });
var Express = require("express");
var dashboard = Express.Router();
var site = Express.Router();
var debug = require("debug")("blot:clients:git:routes");
var clfdate = require("helper/clfdate");
var host = require("config").host;

dashboard.get("/", function (req, res, next) {
  repos.exists(req.blog.handle + ".git", function (exists) {
    if (exists) {
      res.locals.repo = true;
      return next();
    }

    res.redirect(req.baseUrl + "/create");
  });
});

dashboard.get("/", function (req, res) {
  database.getStatus(req.blog.owner, function (err, status) {
    database.getToken(req.blog.owner, function (err, token) {
      res.render(__dirname + "/views/index.html", {
        title: "Git",
        token: token,
        createFailed: status === 'createFailed',
        createInProgress: status === 'createInProgress',
        host,
      });
    });
  });
});

dashboard.get("/create", function (req, res) {
  res.locals.breadcrumbs.add("Git", "git");
  res.render(__dirname + "/views/create.html", {
    title: "Git",
  });
});

dashboard.post("/create", function (req, res, next) {
  
  if (req.body.cancel) {
    console.log(clfdate() + " Git: User cancelled creation of repo");
    return disconnect(req.blog.id, next);
  }

  res.redirect(req.baseUrl);

  create(req.blog, function (err) {
    if (err) {
      console.log(clfdate() + " Git: Error creating repo", err);
    }
  });
});

dashboard.get("/reset-password", function (req, res) {
  res.render(__dirname + "/views/reset-password.html", {
    title: "Git",
  });
});

dashboard.post("/reset-password", function (req, res, next) {
  database.refreshToken(req.blog.owner, function (err) {
    if (err) return next(err);
    res.redirect(req.baseUrl);
  });
});

dashboard.get("/disconnect", function (req, res) {
  res.locals.breadcrumbs.add("Disconnect", "disconnect");
  res.render(__dirname + "/views/disconnect.html", {
    title: "Git",
  });
});

dashboard.post("/disconnect", function (req, res, next) {
  req.blog.client = "";
  disconnect(req.blog.id, next);
});

site.use("/end/:gitHandle.git", authenticate);

// We keep a dictionary of synced blogs for testing
// purposes. There isn't an easy way to determine
// after pushing whether or not Blot has completed the
// sync of the blog's folder. This is because I can't
// work out how to do something asynchronous after we've
// accepted a push but before we've sent the response.
var activeSyncs = {};

function started(blogID) {
  if (activeSyncs[blogID] === undefined) activeSyncs[blogID] = 0;
  activeSyncs[blogID]++;
}

function finished(blogID) {
  activeSyncs[blogID]--;
}

function finishedAllSyncs(blogID) {
  return activeSyncs[blogID] === 0;
}

// Used for testing purposes only to determine when a sync has finished
// Redlock means we can't reliably determine this just by calling
// Blot.sync();
site.get("/syncs-finished/:blogID", function (req, res) {
  res.send(finishedAllSyncs(req.params.blogID));
});

repos.on("push", function (push) {
  push.accept();

  // This might cause an interesting race condition. It happened for me during
  // testing. If we invoke Blog.Sync right now, it should be fine but previously
  // I had an additional asynchronous database lookup to fetch the full blog. I
  // believe this triggered issues in testing, because the test checked to see
  // if a sync had finished that had not actually yet begun. Perhaps we should
  // begin the sync on the "send" event instead of the "finish" event? That
  // might give us a firmer guarantee that the order of events is correct. This
  // seems to be purely a problem for automated use of the git client, humans
  // are unlikely to fire off multiple pushes immediately after the other.
  push.response.on("finish", function () {
    // I'm not sure what happens to lead to this being invoked
    // without a request or blog but it do sometimes.
    if (!push || !push.request || !push.request.blog)
      return debug("No blog found for push", push);

    // Used for testing purposes only
    started(push.request.blog.id);

    sync(push.request.blog.id, push.request.gitHandle, function (err) {
      // Used for testing purposes only
      finished(push.request.blog.id);

      if (err) {
        debug(err);
      } else {
        debug("Sync completed successfully!");
      }
    });
  });
});

// We need to pause then resume for some
// strange reason. Read pushover's issue #30
// For another strange reason, this doesn't work
// when I try and mount it at the same path as
// the authentication middleware, e.g:
// site.use("/end/:gitHandle.git", function(req, res) {
// I would feel more comfortable if I could.
site.use("/end", function (req, res) {
  req.pause();
  repos.handle(req, res);
  req.resume();
});

module.exports = { dashboard: dashboard, site: site };
