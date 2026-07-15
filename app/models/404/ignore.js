var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function (blogID, url, callback) {
  ensure(blogID, "string").and(url, "string").and(callback, "function");

  var ignoreKey = key.ignore(blogID);

  ensure(ignoreKey, "string");

  (async function () {
    try {
      var result = await client.sAdd(ignoreKey, url);
      return callback(null, result);
    } catch (err) {
      return callback(err);
    }
  })();
};
