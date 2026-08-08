const express = require("express");
const Importer = express.Router();
const arena = require("./index");
const init = require("dashboard/site/import/init");
const normalizeIdentifier = require(
  "dashboard/site/import/helper/normalize_identifier"
);
const fs = require("fs-extra");
const { join } = require("path");
const URL = require("url");
const fetch = require("node-fetch");

Importer.get("/are.na", function (req, res) {
  res.redirect(req.baseUrl + "/arena");
});

Importer.route("/arena")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Are.na", "arena");
    res.render("dashboard/import/arena");
  })
  .post(async (req, res) => {
    let slug;

    try {
      const channelURL = new URL.URL(req.body && req.body.channel);
      const parts = channelURL.pathname.split("/").filter(Boolean);

      if (
        channelURL.protocol !== "https:" ||
        !["are.na", "www.are.na"].includes(channelURL.hostname) ||
        parts.length < 2
      ) {
        throw new Error("Invalid Are.na channel URL");
      }

      slug = parts[parts.length - 1];
    } catch (error) {
      return res.message(
        req.baseUrl + "/arena",
        new Error("Enter a valid public Are.na channel URL.")
      );
    }

    const { importDirectory, outputDirectory, finish, status } = init({
      blogID: req.blog.id,
      label: "Are.na",
    });

    try {
      const response = await fetch(`https://api.are.na/v2/channels/${slug}`);
      const json = await response.json();
      const { title } = json;

      fs.outputFileSync(
        join(importDirectory, "identifier.txt"),
        normalizeIdentifier(title, { fallback: "Are.na channel" }),
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
