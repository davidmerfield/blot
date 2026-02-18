var typeset = require("typeset");

function normalizeOption(value) {
  if (value === "false") return false;
  if (value === "true") return true;
  return value;
}

function prerender(html, callback, options) {
  // would be nice to add options. hyphenate in future
  // but it fucks with automatic image links and automatic
  // video links since the contents of the link don't match
  // the href property due to insertion of soft hyphens...

  // Pandoc does a lot of this shit too

  var disable = ["ligatures", "hyphenate"];

  options = options || {};

  for (var i in options) options[i] = normalizeOption(options[i]);

  options.spaces = options.quotes = options.punctuation;

  for (var j in options) if (options[j] === false) disable.push(j);

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
