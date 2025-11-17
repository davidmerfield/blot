var fs = require("fs");
var ensure = require("helper/ensure");
var LocalPath = require("helper/localPath");
var time = require("helper/time");
var extname = require("path").extname;
var Metadata = require("build/metadata");
var cheerio = require("cheerio");
var extend = require("helper/extend");
var convert = require("./convert");

function is(path) {
  return [".rtf"].indexOf(extname(path).toLowerCase()) > -1;
}

function read(blog, path, callback) {
  ensure(blog, "object").and(path, "string").and(callback, "function");

  var localPath = LocalPath(blog.id, path);

  time("stat");

  fs.stat(localPath, function (err, stat) {
    time.end("stat");

    if (err) return callback(err);

    time("readFile");

    fs.readFile(localPath, "utf-8", function (err, text) {
      time.end("readFile");

      if (err) return callback(err);

      convert(blog, text, function (err, html) {
        if (err) return callback(err);
        var metadata = {};
        var $ = cheerio.load(html, { decodeEntities: false }, false);

        $("p").each(function (i) {
          if (i === 0 && $(this).prev().length) {
            return false;
          }

          var text = $(this).text();

          if (text.indexOf(":") === -1) return false;

          var key = text.slice(0, text.indexOf(":"));

          // Key has space
          if (/\s/.test(key.trim())) return false;

          var parsed = Metadata(text);

          if (parsed.html === text) return false;

          extend(metadata).and(parsed.metadata);

          if (parsed.html) {
            $(this).html(parsed.html.trim());
          } else {
            $(this).remove();
          }
        });

        html = $.html().trim();

        var metadataString = "<!--";

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

module.exports = { read: read, is: is, id: "rtf" };
