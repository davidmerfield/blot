var async = require("async");
var fs = require("fs-extra");
module.exports = function (req, res, next) {
  if (!req.files) return next();

  async.each(
    req.files,
    function (file, nextFile) {
      fs.remove(file.path, nextFile);
    },
    next
  );
};
