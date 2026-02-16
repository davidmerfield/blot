var converters = require("./index");

module.exports = function enabledConverters(blog) {
  var preferences = blog && blog.converters;

  if (!preferences || typeof preferences !== "object") {
    return converters;
  }

  return converters.filter(function (converter) {
    if (!Object.prototype.hasOwnProperty.call(preferences, converter.id)) {
      return true;
    }

    return preferences[converter.id] !== false;
  });
};
