const express = require("express");
const Importer = express.Router();
const arena = require("./index");
const init = require("dashboard/site/import/init");
const fs = require("fs-extra");
const { join } = require("path");
const URL = require("url");
const fetch = require("node-fetch");
const sanitize = require("./sanitize");

Importer.route("/are.na")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Are.na", "are.na");
    res.render("dashboard/import/arena");
  })
  .post(async (req, res) => {
    const { importDirectory, outputDirectory, finish, status } = init({
      blogID: req.blog.id,
      label: "Are.na",
    });

    try {
      const slug = URL.parse(req.body.channel).path.split("/").pop();

      const response = await fetch(`https://api.are.na/v2/channels/${slug}`);
      const json = await response.json();
      const { title } = json;

      fs.outputFileSync(
        join(importDirectory, "identifier.txt"),
        sanitize(title),
        "utf-8"
      );
      res.message(req.baseUrl, "Began import");

      await arena({ slug, outputDirectory, status });
      await finish();
    } catch (err) {
      console.error(err);
      fs.outputFile(join(importDirectory, "error.txt"), err.message);
    }
  });

module.exports = Importer;
