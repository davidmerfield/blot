var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function getAllIDs(callback) {
  ensure(callback, "function");

  client
    .sMembers(key.ids)
    .then(function (ids) {
      callback(null, ids);
    })
    .catch(callback);
};
