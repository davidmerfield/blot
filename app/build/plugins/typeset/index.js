var typeset = require("typeset");

function prerender(html, callback, options) {
  // would be nice to add options. hyphenate in future
  // but it fucks with automatic image links and automatic
  // video links since the contents of the link don't match
  // the href property due to insertion of soft hyphens...

  // Pandoc does a lot of this shit too

  var disable = ["ligatures", "hyphenate"];

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
  description: "Correct common typographic errors",
  options: {
    hangingPunctuation: true,
    punctuation: true,
    smallCaps: true,
  },
};
