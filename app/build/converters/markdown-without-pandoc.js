// This is used when people are running the server
// locally on a machine without pandoc – it's useful
// for developers who want to contribute
const fs = require("fs-extra");
const { marked } = require("marked");
const extname = require("path").extname;
const localPath = require("helper/localPath");

module.exports = {
  read: function (blog, path, callback) {
    path = localPath(blog.id, path);

    const text = fs.readFileSync(path, "utf-8");
    const stat = fs.statSync(path);
    const html = marked.parse(text);

    callback(null, html, stat);
  },
  is: function is (path) {
    return (
      [".txt", ".text", ".md", ".markdown"].indexOf(
        extname(path).toLowerCase()
      ) > -1
    );
  },
  id: "markdown"
};
