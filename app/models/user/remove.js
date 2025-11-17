var getById = require("./getById");
var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");

module.exports = function remove (uid, callback) {
  ensure(uid, "string").and(callback, "function");

  var multi = client.multi();

  getById(uid, function (err, user) {
    if (err) throw err;

    var keys = [
      key.user(uid),
      key.email(user.email),
      "sync:lease:" + uid,
      "sync:again:" + uid
    ];

    if (user.subscription.customer) {
      keys.push(key.customer(user.subscription.customer));
    }

    if (user.paypal.id) {
      keys.push(key.paypal(user.paypal.id));
    }

    multi.srem(key.uids, uid);
    multi.del(keys);

    multi.exec(callback);
  });
};
