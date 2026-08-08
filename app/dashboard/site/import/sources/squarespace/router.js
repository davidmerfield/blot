const express = require("express");
const Importer = express.Router();

const fs = require("fs-extra");
const { join } = require("path");

const init = require("dashboard/site/import/init");
const normalizeIdentifier = require(
  "dashboard/site/import/helper/normalize_identifier"
);
const wordpress = require("../wordpress");

Importer.route("/squarespace")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Squarespace", "squarespace");
    res.render("dashboard/import/squarespace");
  })
  .post(function (req, res) {
    const exportUpload =
      req.files &&
      Array.isArray(req.files.exportUpload) &&
      req.files.exportUpload[0];

    if (!exportUpload || !exportUpload.path) {
      return res.message(
        req.baseUrl + "/squarespace",
        new Error("Please select a Squarespace export file.")
      );
    }

    const { importDirectory, outputDirectory, finish, status } = init({
      blogID: req.blog.id,
      label: "Squarespace",
    });

    res.message(req.baseUrl, "Began import");

    const identifier = normalizeIdentifier(exportUpload.originalFilename, {
      extension: ".xml",
      fallback: "Squarespace export",
    });
    const inputXML = exportUpload.path;

    fs.outputFileSync(
      join(importDirectory, "identifier.txt"),
      identifier,
      "utf-8"
    );

    wordpress(inputXML, outputDirectory, status, {}, async function (err) {
      try {
        if (err) {
          console.trace();
          console.log("finally here with message", err);
          return await fs.outputFile(
            join(importDirectory, "error.txt"),
            err.message
          );
        }

        try {
          await finish();
        } catch (err) {
          await fs.outputFile(join(importDirectory, "error.txt"), err.message);
        }
      } finally {
        await fs
          .remove(inputXML)
          .catch((removeError) =>
            console.error("Failed to remove Squarespace upload", removeError)
          );
      }
    });
  });

module.exports = Importer;
