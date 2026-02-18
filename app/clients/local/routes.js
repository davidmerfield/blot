var Express = require("express");
var setup = require("./setup");
var disconnect = require("./disconnect");
var Blog = require("models/blog");

// It's important this is an Express router
// and not an Express app for reasons unknown
var Dashboard = Express.Router();

// By the time this middleware is mounted, blot
// has fetched the information about this user.
Dashboard.get("/", function (req, res, next) {
  function render() {
    setup(req.blog.id, function (err) {
      if (err) console.log("Error setting up", err);
    });

    res.render(__dirname + "/views/index.html");
  }

  if (req.blog.client === "local") {
    return render();
  }

  Blog.set(req.blog.id, { client: "local" }, function (err) {
    if (err) return next(err);

    req.blog.client = "local";
    render();
  });
});

Dashboard.route("/disconnect")
  .get(function (req, res) {
    res.render(__dirname + "/views/disconnect.html");
  })
  .post(function (req, res, next) {
    disconnect(req.blog.id, next);
  });

module.exports = Dashboard;
