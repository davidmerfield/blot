var Plugins = require("build/plugins");

module.exports = function (req, res, callback) {
  Plugins.load("js", req.blog.plugins, callback);
};
