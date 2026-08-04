var fs = require("fs-extra");

module.exports = function (post, callback) {
  var atime, mtime;

  let path = post.path;

  if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
    path += "/post.txt";
  } else {
    path += ".txt";
  }

  // Remove leading and trailing whitespace
  post.content = post.content.trim();

  fs.outputFile(path, post.content, function (err) {
    if (err) return callback(err);

    atime = Date.now();
    mtime = post.updated || post.created || post.dateStamp || Date.now();

    fs.utimes(path, atime, mtime, function (err) {
      if (err) return callback(err);
      callback(null);
    });
  });
};
