var User = require("models/user");
var config = require("config");
var stripe = require("stripe")(config.stripe.secret);
var getConfirmation = require("../util/getConfirmation");
var each = require("../each/user");
var colors = require("colors/safe");

function main(user, callback) {
  if (
    !user.subscription ||
    !user.subscription.customer ||
    !user.subscription.id
  ) {
    console.log(
      colors.dim(
        "User:",
        user.uid,
        user.email,
        "does not have a Stripe subscription"
      )
    );

    return callback();
  }

  stripe.customers.retrieveSubscription(
    user.subscription.customer,
    user.subscription.id,
    function (err, subscription) {
      if (
        err &&
        err.code === "resource_missing" &&
        err.param === "subscription"
      ) {
        console.log(
          colors.red(
            "User:",
            user.uid,
            user.email,
            "used to have a Stripe subscription but no longer does, customer still exists on Stripe"
          )
        );
        return callback();
      }

      if (err && err.code === "resource_missing" && err.param === "id") {
        console.log(
          colors.red(
            "User:",
            user.uid,
            user.email,
            "used to have a Stripe subscription but no longer does, customer does not exist on Stripe"
          )
        );
        return callback();
      }

      if (err) {
        console.log(err);
      }

      if (err || !subscription)
        return callback(err || new Error("No subscription"));

      User.set(user.uid, { subscription: subscription }, function (err) {
        if (err) return callback(err);

        console.log(
          "User:",
          user.uid,
          user.email,
          user.subscription.customer,
          "updated subscription",
          user.subscription.id
        );

        callback(null, subscription);
      });
    }
  );
}

function done(err) {
  if (err) throw err;
  console.log("Done!");
  process.exit();
}

if (require.main === module) {
  if (process.argv[2]) {
    User.getByEmail(process.argv[2], function (err, user) {
      if (err || !user) throw err || new Error("No user");
      main(user, done);
    });
  } else {
    getConfirmation(
      "Fetch latest subscription information from Stripe for all users? (y/N)",
      function (err, ok) {
        if (!ok) return process.exit();
        each(main, done);
      }
    );
  }
}

module.exports = main;
