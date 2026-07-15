var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var getById = require("./getById");

module.exports = function getByPayPalSubscriptionId(subscriptionId, callback) {
  ensure(subscriptionId, "string").and(callback, "function");

  (async function () {
    try {
      var uid = await client.get(key.paypal(subscriptionId));

      if (!uid) return callback(null, null);

      return getById(uid, callback);
    } catch (err) {
      return callback(err);
    }
  })();
};
