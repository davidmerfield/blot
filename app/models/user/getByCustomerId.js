var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var getById = require("./getById");

module.exports = function getByCustomerId(customerId, callback) {
  ensure(customerId, "string").and(callback, "function");

  client.get(key.customer(customerId), function (err, uid) {
    if (err) return callback(err);

    if (!uid) return callback(null, null);

    getById(uid, callback);
  });
};
