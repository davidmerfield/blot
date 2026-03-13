var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function (blogID, url, callback) {
  ensure(blogID, "string").and(url, "string").and(callback, "function");

  var ignoreKey = key.ignore(blogID);

  ensure(ignoreKey, "string");

  return client.SREM(ignoreKey, url, callback);
};
