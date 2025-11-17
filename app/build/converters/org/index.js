var fs = require("fs");
var ensure = require("helper/ensure");
var LocalPath = require("helper/localPath");
var time = require("helper/time");
var extname = require("path").extname;
var Metadata = require("build/metadata");
var convert = require("./convert");
const { lte } = require("lodash");

function is (path) {
  return [".org"].indexOf(extname(path).toLowerCase()) > -1;
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

      const { html, metadata } = Metadata(contents);

      convert(blog, html, function (err, html) {
        if (err) return callback(err);

        let metadataString = "<!--";

        for (var i in metadata) metadataString += "\n" + i + ": " + metadata[i];

        if (metadataString !== "<!--") {
          metadataString += "\n-->\n";
          html = metadataString + html;
        }

        callback(null, html, stat);
      });
    });
  });
}

module.exports = { read: read, is: is, id: "org"};
