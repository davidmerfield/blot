var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var getById = require("./getById");

module.exports = function getByPayPalSubscriptionId (subscriptionId, callback) {
  ensure(subscriptionId, "string").and(callback, "function");

  client.get(key.paypal(subscriptionId), function (err, uid) {
    if (err) return callback(err);

    if (!uid) return callback(null, null);

    getById(uid, callback);
  });
};
