var Plugins = require("build/plugins");

module.exports = function (req, res, callback) {
  Plugins.load("css", req.blog.plugins, callback);
};
