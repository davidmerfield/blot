var Turndown = require("turndown");
var turndown = new Turndown();
var debug = require("debug")("blot:importer:wordpress:markdown");

// We override Turndown's HTML escaping function. Wordpress
// sometimes includes Markdown inside the HTML content of
// an item. By default, Turndown escapes this, e.g.
// _Hey_ becomes \_Hey\_ since it assumes the input is pure
// HTML. But we want the Markdown generally, so we remove the
// escaping and do nothing to the HTML.
turndown.escape = function (html) {
  return html;
};

module.exports = function (entry, callback) {
  debug();
  debug();
  debug("Input HTML:");
  debug();
  debug(entry.html);

  entry.content = turndown.turndown(entry.html);

  entry.content = entry.content.trim();

  debug();
  debug();
  debug("Result:");
  debug();
  debug(entry.content);

  callback(null, entry);
};
