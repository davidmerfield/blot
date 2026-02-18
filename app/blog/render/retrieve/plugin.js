var Plugins = require("build/plugins");

module.exports = function (req, res, callback) {
  var requested = (req.retrieve && req.retrieve.plugin) || {};
  var response = {};
  var pluginList = Plugins.list || {};
  var blogPlugins = (req.blog && req.blog.plugins) || {};

  if (requested === true || typeof requested !== "object") requested = {};

  Object.keys(requested).forEach(function (pluginName) {
    var pluginRequest = requested[pluginName];
    var pluginConfig = blogPlugins[pluginName];
    var pluginMeta = pluginList[pluginName];

    if (!pluginMeta || !pluginConfig || !pluginConfig.enabled) return;
    if (!pluginRequest || typeof pluginRequest !== "object") return;

    var value = {};

    if (pluginRequest.css) value.css = pluginMeta.publicCSS || "";
    if (pluginRequest.js) value.js = pluginMeta.publicJS || "";

    if (Object.keys(value).length) response[pluginName] = value;
  });

  if (!Object.keys(response).length) return callback();

  callback(null, response);
};
