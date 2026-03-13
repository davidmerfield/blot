var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function getAllIDs(callback) {
  ensure(callback, "function");

  client.smembers(key.ids, callback);
};
