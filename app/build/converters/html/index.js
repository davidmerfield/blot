var fs = require("fs");
var ensure = require("helper/ensure");
var LocalPath = require("helper/localPath");
var extname = require("path").extname;

function is(path) {
  return [".html", ".htm"].indexOf(extname(path).toLowerCase()) > -1;
}

function read(blog, path, callback) {
  ensure(blog, "object").and(path, "string").and(callback, "function");

  var localPath = LocalPath(blog.id, path);

  fs.stat(localPath, function (err, stat) {
    if (err) return callback(err);
    // Don't try and turn HTML files larger than 5mb into posts
    if (stat && stat.size > 5 * 1000 * 1000)
      return callback(new Error("HTML File too big"));

    fs.readFile(localPath, "utf-8", function (err, contents) {
      if (err) return callback(err);

      return callback(null, contents, stat);
    });
  });
}

module.exports = { read: read, is: is, id: "html" };
