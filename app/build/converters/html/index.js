var fs = require("fs");
var ensure = require("helper/ensure");
var LocalPath = require("helper/localPath");
var extname = require("path").extname;
var cheerio = require("cheerio");
var Metadata = require("build/metadata");
var normalizeLiteralDollarMath = require("build/math/normalizeLiteralDollars").normalizeLiteralDollarMath;

function is(path) {
  return [".html", ".htm"].indexOf(extname(path).toLowerCase()) > -1;
}

function read(blog, path, callback) {
  ensure(blog, "object")
    .and(path, "string")
    .and(callback, "function");

  var localPath = LocalPath(blog.id, path);

  fs.stat(localPath, function (err, stat) {
    if (err) return callback(err);
    // Don't try and turn HTML files larger than 5mb into posts
    if (stat && stat.size > 5 * 1000 * 1000)
      return callback(new Error("HTML File too big"));

    fs.readFile(localPath, "utf-8", function (err, contents) {
      if (err) return callback(err);

      // Metadata must be extracted from the source, rather than from Cheerio's
      // serialization. In particular, serialization can encode characters in
      // metadata values (such as "&"), changing both the value and its slug.
      var parsed = Metadata(contents);
      var $ = cheerio.load(parsed.html, { decodeEntities: false }, false);
      normalizeLiteralDollarMath($);

      return callback(null, $.html(), stat, {
        preExtractedMetadata: parsed.metadata
      });
    });
  });
}

module.exports = { read: read, is: is, id: "html" };
