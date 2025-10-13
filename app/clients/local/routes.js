var Express = require("express");
var setup = require("./setup");
var disconnect = require("./disconnect");
const fetch = require("node-fetch");

const DEFAULT_OPEN_FOLDER_ORIGIN =
  process.env.LOCAL_OPEN_FOLDER_ORIGIN ||
  (process.env.CONTAINER_NAME
    ? "http://host.docker.internal:3020"
    : "http://localhost:3020");

// It's important this is an Express router
// and not an Express app for reasons unknown
var Dashboard = Express.Router();

// By the time this middleware is mounted, blot
// has fetched the information about this user.
Dashboard.get("/", function (req, res) {
  setup(req.blog.id, function (err) {
    if (err) console.log("Error setting up", err);
  });
  res.render(__dirname + "/views/index.html");
});

Dashboard.get("/open", async function (req, res, next) {
  const folderPath = `data/blogs/${req.blog.id}`;
  try {
    const response = await fetch(`${DEFAULT_OPEN_FOLDER_ORIGIN}/open-folder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: folderPath }),
    });

    if (!response.ok) {
      throw new Error("Request failed");
    }

    res.redirect(res.locals.base);
  } catch (error) {
    next(new Error("Could not open folder on your computer"));
  }
});

Dashboard.route("/disconnect")
  .get(function (req, res) {
    res.render(__dirname + "/views/disconnect.html");
  })
  .post(function (req, res, next) {
    disconnect(req.blog.id, next);
  });

module.exports = Dashboard;
