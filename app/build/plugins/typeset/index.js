var typeset = require("typeset");
var parseBoolean = require("helper/parseBoolean");

function prerender(html, callback, options) {
  // would be nice to add options. hyphenate in future
  // but it fucks with automatic image links and automatic
  // video links since the contents of the link don't match
  // the href property due to insertion of soft hyphens...

  // Pandoc does a lot of this shit too

  var disable = ["ligatures", "hyphenate"];

  options = options || {};

  for (var key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      var parsed = parseBoolean(options[key]);
      options[key] = typeof parsed === "boolean" ? parsed : options[key];
    }
  }

  options.spaces = options.quotes = options.punctuation;

  for (var i in options) if (options[i] === false) disable.push(i);

  try {
    html = typeset(html, { disable: disable });
  } catch (e) {}

  return callback(null, html);
}

module.exports = {
  prerender: prerender,
  category: "Typography",
  title: "Substitution",
  description: "Fix common typographical errors",
  options: {
    hangingPunctuation: true,
    punctuation: true,
    smallCaps: true,
  },
};
