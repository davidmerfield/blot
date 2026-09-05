var fs = require("fs");
var ensure = require("helper/ensure");
var LocalPath = require("helper/localPath");
var time = require("helper/time");
var extname = require("path").extname;
var Metadata = require("build/metadata");
var convert = require("./convert");

function is (path) {
  return [".org"].indexOf(extname(path).toLowerCase()) > -1;
}

function toDeterministicMetadataComment (metadata) {
  const keys = Object.keys(metadata || {}).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  if (!keys.length) return "";

  let metadataComment = "<!--";

  keys.forEach((key) => {
    metadataComment += "\n" + key + ": " + metadata[key];
  });

  return metadataComment + "\n-->\n";
}

function mergeOrgMetadata (outerMetadata, innerMetadata) {
  const mergedMetadata = {};

  [outerMetadata, innerMetadata].forEach((source) => {
    Object.keys(source || {}).forEach((key) => {
      mergedMetadata[key] = source[key];
    });
  });

  return mergedMetadata;
}

function read (blog, path, callback) {
  ensure(blog, "object")
    .and(path, "string")
    .and(callback, "function");

  var localPath = LocalPath(blog.id, path);

  time("stat");

  fs.stat(localPath, function (err, stat) {
    time.end("stat");

    if (err) return callback(err);

    time("readFile");

    fs.readFile(localPath, "utf-8", function (err, contents) {
      time.end("readFile");

      if (err) return callback(err);

      const { html: orgBody, metadata: orgMetadata } = Metadata(contents);

      convert(blog, orgBody, function (err, html, yamlMetadata) {
        if (err) return callback(err);

        // Canonical metadata handling for org conversion:
        // 1. Parse org-style header metadata before conversion.
        // 2. Parse YAML metadata extracted from a leading YAML source block after conversion.
        // 3. Merge both sources with YAML taking precedence for identical keys.
        const mergedMetadata = mergeOrgMetadata(orgMetadata, yamlMetadata);
        const metadataComment = toDeterministicMetadataComment(mergedMetadata);

        callback(null, metadataComment + html, stat);
      });
    });
  });
}

module.exports = { read: read, is: is, id: "org"};
