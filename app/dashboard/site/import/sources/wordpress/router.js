const express = require("express");
const Importer = express.Router();

const fs = require("fs-extra");
const { join } = require("path");

const init = require("dashboard/site/import/init");
const normalizeIdentifier = require(
  "dashboard/site/import/helper/normalize_identifier"
);

const wordpress = require("./index");

Importer.route("/wordpress")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("WordPress", "wordpress");
    res.render("dashboard/import/wordpress");
  })
  .post(function (req, res) {
    const exportUpload =
      req.files &&
      Array.isArray(req.files.exportUpload) &&
      req.files.exportUpload[0];

    if (!exportUpload || !exportUpload.path) {
      return res.message(
        req.baseUrl + "/wordpress",
        new Error("Please select a WordPress export file.")
      );
    }

    const { importDirectory, outputDirectory, finish, status } = init({
      blogID: req.blog.id,
      label: "WordPress",
    });

    res.message(req.baseUrl, "Began import");

    const identifier = normalizeIdentifier(exportUpload.originalFilename, {
      extension: ".xml",
      fallback: "WordPress export",
    });
    const inputXML = exportUpload.path;

    fs.outputFileSync(
      join(importDirectory, "identifier.txt"),
      identifier,
      "utf-8"
    );

    wordpress(inputXML, outputDirectory, status, {}, async function (err) {
      if (err) {
        console.trace();
        console.log("finally here with message", err);
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
