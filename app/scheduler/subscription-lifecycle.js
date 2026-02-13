var clfdate = require("helper/clfdate");
var User = require("models/user");
var eachUser = require("../../scripts/each/user");
var email = require("helper/email");
var subscriptionLifecycle = require("models/user/subscriptionLifecycle");

function deleteUserAccount(user, callback) {
  void user;
  // Safety rollout: temporarily keep this as a no-op so we can verify
  // subscription lifecycle behavior in production before permanently
  // deleting user data.
  callback();
}

module.exports = function processSubscriptionLifecycle(callback) {
  callback = callback || function () {};

  var disabled = 0;
  var deleted = 0;

  eachUser(
    function (user, next) {
      var details = subscriptionLifecycle.cancellationDetails(user);

      if (!details.cancelled || !details.periodEnded) return next();

      if (!user.isDisabled) {
        return User.disable(user, function (disableErr) {
          if (disableErr) return next(disableErr);
          disabled += 1;

          if (!subscriptionLifecycle.deletionDue(user)) return next();

          var periodEndedAtISO = details.periodEndedAt
            ? new Date(details.periodEndedAt).toISOString()
            : "unknown";

          deleteUserAccount(user, function (deleteErr) {
            if (deleteErr) return next(deleteErr);

            email.DELETED_CANCELLED_SUBSCRIPTION_EXPIRED("", {
              email: user.email,
              subscriptionExpiredOn: periodEndedAtISO,
            });

            deleted += 1;
            next();
          });
        });
      }

      if (!subscriptionLifecycle.deletionDue(user)) return next();

      var periodEndedAtISO = details.periodEndedAt
        ? new Date(details.periodEndedAt).toISOString()
        : "unknown";

      deleteUserAccount(user, function (deleteErr) {
        if (deleteErr) return next(deleteErr);

        email.DELETED_CANCELLED_SUBSCRIPTION_EXPIRED("", {
          email: user.email,
          subscriptionExpiredOn: periodEndedAtISO,
        });

        deleted += 1;
        next();
      });
    },
    function (err) {
      if (err) {
        console.log(clfdate(), "Subscription lifecycle job failed", err);
        return callback(err);
      }

      console.log(
        clfdate(),
        "Subscription lifecycle job complete",
        "disabled=" + disabled,
        "deleted=" + deleted
      );

      callback();
    }
  );
};
