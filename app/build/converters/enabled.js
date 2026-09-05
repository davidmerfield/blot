var converters = require("./index");
var normalizeConverters = require("models/blog/util/converters").normalize;

module.exports = function enabledConverters(blog) {
  var preferences = normalizeConverters(blog && blog.converters);

  return converters.filter(function (converter) {
    return preferences[converter.id] !== false;
  });
};
