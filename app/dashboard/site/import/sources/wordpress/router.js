const express = require("express");
const Importer = express.Router();

const fs = require("fs-extra");
const { join } = require("path");

const init = require("dashboard/site/import/init");

const multiparty = require("multiparty");

const maxFieldsSize = 4 * 1024 * 1024; // 4mb
const maxFilesSize = 30 * 1024 * 1024; // 30mb

const wordpress = require("./index");

Importer.route("/wordpress")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Wordpress", "wordpress");
    res.render("dashboard/import/wordpress");
  })
  .post(function (req, res) {
    const upload = req.files && req.files.exportUpload && req.files.exportUpload[0];
    if (!upload || !upload.path) {
      return res.message(req.baseUrl, new Error("Please select a WordPress export file."));
    }
    const { importDirectory, outputDirectory, finish, status, ready } = init({
      blogID: req.blog.id,
      label: "Wordpress",
    });

    res.message(req.baseUrl, "Began import");

    const exportUpload = upload;
    const identifier = exportUpload.originalFilename;
    const inputXML = exportUpload.path;

    ready.then(() => fs.outputFile(
      join(importDirectory, "identifier.txt"),
      identifier,
      "utf-8"
    )).then(() => wordpress(inputXML, outputDirectory, status, {}, async function (err) {
      if (err) {
        console.trace();
        console.log('finally here with message', err);
        await fs.outputFile(join(importDirectory, "error.txt"), err.message);
        return status("Failed");
      }

      try {
        await finish();
      } catch (err) {
        await fs.outputFile(join(importDirectory, "error.txt"), err.message);
        await status("Failed");
      }
    })).catch(async (err) => {
      await fs.outputFile(join(importDirectory, "error.txt"), err.message);
      await status("Failed");
    });
  });

module.exports = Importer;
