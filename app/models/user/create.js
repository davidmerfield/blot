var ensure = require("helper/ensure");
var key = require("./key");
var client = require("models/client");
var validate = require("./validate");
var generateId = require("./generateId");
var scheduleSubscriptionEmail = require("./scheduleSubscriptionEmail");

module.exports = function create (
  email,
  passwordHash,
  subscription,
  paypal,
  callback
) {
  ensure(email, "string")
    .and(passwordHash, "string")
    .and(subscription, "object")
    .and(paypal, "object")
    .and(callback, "function");

  var multi, userString;
  var uid = generateId();

  var user = {
    uid: uid,
    isDisabled: false,
    blogs: [],
    lastSession: "",
    email: email,
    subscription: subscription,
    paypal: paypal,
    passwordHash: passwordHash
  };

  validate({ uid: uid }, user, function (err, user) {
    if (err) return callback(err);

    try {
      userString = JSON.stringify(user);
    } catch (e) {
      return callback(e);
    }

    // If I add or remove methods here
    // also remove them from set.js
    multi = client.multi();
    multi.sadd(key.uids, uid);
    multi.setnx(key.user(uid), userString);
    multi.set(key.email(user.email), uid);
    multi.set(key.user(uid), userString);

    // some users might not have stripe subscriptions
    if (user.subscription && user.subscription.customer)
      multi.set(key.customer(user.subscription.customer), uid);

    // some users might not have paypal subscriptions
    if (user.paypal && user.paypal.id)
      multi.set(key.paypal(user.paypal.id), uid);

    multi.exec(function (err) {
      // Retry if generated ID was in use
      if (err && err.code === "SETNX")
        return create(email, passwordHash, subscription, callback);

      // I need to handle uid collision gracefully
      if (err) console.log(err);

      if (err) return callback(err);

      // Schedule a notifcation email for their subscription renewal
      scheduleSubscriptionEmail(user.uid, function (err) {
        if (err) console.log(err);
      });

      callback(null, user);
    });
  });
};
