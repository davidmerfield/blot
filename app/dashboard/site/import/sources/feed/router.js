const express = require("express");
const Importer = express.Router();

const fs = require("fs-extra");
const { join } = require("path");

const init = require("dashboard/site/import/init");

const feed = require("./index");

Importer.route("/feed")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Feed", "feed");
    res.render("dashboard/import/feed");
  })
  .post(function (req, res) {
    const { importDirectory, outputDirectory, finish, status } = init({
      blogID: req.blog.id,
      label: "Feed",
    });

    res.message(req.baseUrl, "Began import");

    const { feedUrl } = req.body;
    const sourceFile = join(importDirectory, "feed-url.json");

    fs.outputFileSync(
      join(importDirectory, "identifier.txt"),
      feedUrl,
      "utf-8"
    );

    fs.outputJsonSync(sourceFile, { feedUrl });

    feed(sourceFile, outputDirectory, status, {}, async function (err) {
      if (err) {
        return fs.outputFile(join(importDirectory, "error.txt"), err.message);
      }

      try {
        await finish();
      } catch (err) {
        fs.outputFile(join(importDirectory, "error.txt"), err.message);
      }
    });
  });

module.exports = Importer;
