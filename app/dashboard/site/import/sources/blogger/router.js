const express = require("express");
const fs = require("fs-extra");
const { basename, extname, join } = require("path");

const init = require("dashboard/site/import/init");
const blogger = require("./index");

const Importer = express.Router();
const MAX_IDENTIFIER_LENGTH = 120;

function identifierFor(filename) {
  const identifier = basename(String(filename || "").replace(/\\/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_IDENTIFIER_LENGTH);

  return identifier && identifier !== "." && identifier !== ".."
    ? identifier
    : "Blogger export";
}

function isXML(upload) {
  const contentType = String(
    upload.headers && upload.headers["content-type"]
      ? upload.headers["content-type"]
      : upload.mimetype || ""
  )
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  return (
    extname(upload.originalFilename || "").toLowerCase() === ".xml" ||
    contentType === "application/xml" ||
    contentType === "text/xml" ||
    contentType.endsWith("+xml")
  );
}

function errorMessage(error) {
  const message = error && error.message ? error.message : String(error);
  return (
    message.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim() ||
    "Blogger import failed"
  ).slice(0, 300);
}

Importer.route("/blogger")
  .get(function (req, res) {
    res.locals.breadcrumbs.add("Blogger", "blogger");
    res.render("dashboard/import/blogger");
  })
  .post(function (req, res) {
    const upload =
      req.files &&
      Array.isArray(req.files.exportUpload) &&
      req.files.exportUpload[0];

    if (!upload || !upload.path) {
      return res.message(
        req.baseUrl,
        new Error("Please select a Blogger XML export file.")
      );
    }

    if (!isXML(upload)) {
      fs.remove(upload.path).catch(() => {});
      return res.message(
        req.baseUrl,
        new Error("Please upload an XML file exported from Blogger.")
      );
    }

    const job = init({ blogID: req.blog.id, label: "Blogger" });
    res.message(req.baseUrl, "Began import");

    // Start after the response has been handed back to Express. The converter's
    // promise resolves only after its Markdown and asset-writing pipeline ends.
    setImmediate(async () => {
      try {
        await fs.outputFile(
          join(job.importDirectory, "identifier.txt"),
          identifierFor(upload.originalFilename),
          "utf8"
        );
        await blogger(upload.path, job.outputDirectory, job.status);
        await job.finish();
      } catch (error) {
        await fs
          .outputFile(
            join(job.importDirectory, "error.txt"),
            errorMessage(error),
            "utf8"
          )
          .catch((writeError) =>
            console.error("Failed to record import error", writeError)
          );
      } finally {
        await fs
          .remove(upload.path)
          .catch((removeError) =>
            console.error("Failed to remove Blogger upload", removeError)
          );
      }
    });
  });

module.exports = Importer;
