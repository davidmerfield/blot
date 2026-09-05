var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function (blogID, from, callback) {
  ensure(blogID, "string").and(from, "string").and(callback, "function");

  var redirects = key.redirects(blogID);
  var fromKey = key.redirect(blogID, from);

  (async function () {
    try {
      await client.zRem(redirects, from);
      await client.del(fromKey);

      callback();
    } catch (err) {
      callback(err);
    }
  })();
};
