var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function getAllIds(callback) {
  ensure(callback, "function");

  client.SMEMBERS(key.uids, callback);
};
