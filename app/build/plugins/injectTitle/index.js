const titlify = require("../prepare/titlify");

function render($, callback, options = {}) {
  try {
    if (!needsTitle($)) return callback();

    const title = getTitleFromPath(options.path);

    if (!title) return callback();

    const heading = $("<h1></h1>").text(title);
    const firstChild = $.root().children().first();

    if (firstChild && firstChild.length) {
      firstChild.before(heading);
    } else {
      $.root().append(heading);
    }
  } catch (err) {
    // Ignore errors to avoid breaking the build pipeline
  }

  return callback();
}

function needsTitle($) {
  return $("h1, h2, h3, h4").length === 0;
}

function getTitleFromPath(path) {
  if (!path) return "";

  try {
    return titlify(path) || "";
  } catch (err) {
    return "";
  }
}

module.exports = {
  render,
  isDefault: false,
  category: "Formatting",
  title: "Inject title",
  description: "Insert a heading derived from the file name when none exists.",
  options: {
    manuallyDisabled: false,
  },
};
