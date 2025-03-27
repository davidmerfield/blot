var join = require("path").join;
var blog_folder_dir = require("config").blog_folder_dir;
var fs = require("fs-extra");

module.exports = function (req, callback) {
  var path = join(blog_folder_dir, req.blog.id, "public");

  fs.readdir(path, function (err, contents) {
    // The user doesn't have a public folder
    if (err && err.code === "ENOENT") return callback(null, []);

    contents = contents.map(function (name) {
      return {
        path: join(path, name),
        name: name,
      };
    });

    return callback(err, contents);
  });
};
