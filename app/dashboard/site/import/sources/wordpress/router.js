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
  .post(async function (req, res, next) {
    const exportUpload = req.files?.exportUpload?.[0];

    if (!exportUpload) {
      return next(new Error("Please select a WordPress export file"));
    }

    let context;

    try {
      context = await init({ blogID: req.blog.id, label: "Wordpress" });

      const { importDirectory, outputDirectory, finish, status } = context;
      const identifier = exportUpload.originalFilename;
      const inputXML = exportUpload.path;

      fs.outputFileSync(
        join(importDirectory, "identifier.txt"),
        identifier,
        "utf-8"
      );

      wordpress(
        inputXML,
        outputDirectory,
        status,
        { context },
        async function (err) {
          if (err) {
            if (err.cancelled) return;
            console.trace();
            console.log("finally here with message", err);
            return fs.outputFile(
              join(importDirectory, "error.txt"),
              err.message
            );
          }

          try {
            await finish();
          } catch (err) {
            await fs.outputFile(join(importDirectory, "error.txt"), err.message);
          }
        }
      );

      res.message(req.baseUrl, "Began import");
    } catch (err) {
      if (!res.headersSent) return next(err);
      if (context?.importDirectory) {
        await fs
          .outputFile(join(context.importDirectory, "error.txt"), err.message)
          .catch((writeErr) =>
            console.error("Failed to record import error", writeErr)
          );
      }
    }
  });

module.exports = Importer;
