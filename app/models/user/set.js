var ensure = require("helper/ensure");
var validate = require("./validate");
var client = require("models/client");
var updateBillingEmail = require("./updateBillingEmail");
var key = require("./key");
var getById = require("./getById");

module.exports = function save(uid, updates, callback) {
  ensure(uid, "string").and(updates, "object").and(callback, "function");

  var multi, userString, former;

  getById(uid, function (err, user) {
    if (err) return callback(err);

    if (!user) return callback(new Error("No user"));

    // Clone the state of the user so we can
    // compare any changes further down
    former = JSON.parse(JSON.stringify(user));

    if (typeof user.created === "undefined") user.created = 0;
    if (typeof user.welcomeEmailSent === "undefined")
      user.welcomeEmailSent = true;

    validate(user, updates, function (err, user, changes) {
      if (err) return callback(err);

      try {
        userString = JSON.stringify(user);
      } catch (e) {
        return callback(e);
      }

      // If I add or remove methods here
      // also remove them from create.js
      multi = client.multi();

      // Should this be setNX? We don't want to clobber
      // emails which are set between validation and here.
      if (user.email) multi.set(key.email(user.email), uid);

      // If the user changes their email, remove the old
      // email pointing to the User's ID.
      if (former.email && former.email !== user.email) {
        multi.del(key.email(former.email));
        updateBillingEmail(user, function (err) {
          console.log("Error updating email for customer on Stripe:", err);
        });
      }

      multi.set(key.user(uid), userString);

      // some users might not have stripe subscriptions
      if (user.subscription && user.subscription.customer)
        multi.set(key.customer(user.subscription.customer), uid);

      // some users might not have paypal subscriptions
      if (user.paypal && user.paypal.id)
        multi.set(key.paypal(user.paypal.id), uid);

      multi.exec(function (err) {
        if (err) return callback(err);

        callback(null, changes);
      });
    });
  });
};
