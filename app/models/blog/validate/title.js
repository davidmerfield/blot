var ensure = require("helper/ensure");

var TOO_LONG = "Choose a title under 70 characters";

module.exports = function (blogID, title, callback) {
  ensure(blogID, "string").and(title, "string").and(callback, "function");

  // Normalize to Unicode NFC
  title = title.normalize("NFC");

  // Remove leading and trailing whitespace
  title = title.trim();

  if (title.length > 70) return callback(new Error(TOO_LONG));

  return callback(null, title);
};
