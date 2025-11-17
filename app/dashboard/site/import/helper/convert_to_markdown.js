var Turndown = require("turndown");
var turndown = new Turndown();

// We override Turndown's HTML escaping function. Wordpress
// sometimes includes Markdown inside the HTML content of
// an item. By default, Turndown escapes this, e.g.
// _Hey_ becomes \_Hey\_ since it assumes the input is pure
// HTML. But we want the Markdown generally, so we remove the
// escaping and do nothing to the HTML.
turndown.escape = function (html) {
  return html;
};

turndown.keep(['audio', 'video', 'iframe']);

module.exports = function (post, callback) {
  if (post.html && post.content === undefined) {
    post.content = turndown.turndown(post.html).trim();
  } 

  return callback(null, post);
};
