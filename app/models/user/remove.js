var getById = require("./getById");
var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");

module.exports = function remove(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  getById(uid, function (err, user) {
    if (err) return callback(err);
    if (!user) return callback(new Error("No user"));

    var keys = [
      key.user(uid),
      key.email(user.email),
      "sync:lease:" + uid,
      "sync:again:" + uid,
    ];

    if (user.subscription && user.subscription.customer) {
      keys.push(key.customer(user.subscription.customer));
    }

    if (user.paypal && user.paypal.id) {
      keys.push(key.paypal(user.paypal.id));
    }

    (async function () {
      try {
        var multi = client.multi();

        multi.sRem(key.uids, uid);
        multi.del(keys);

        await multi.exec();

        return callback(null);
      } catch (err) {
        return callback(err);
      }
    })();
  });
};
