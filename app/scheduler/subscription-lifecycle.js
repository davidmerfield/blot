var async = require("async");
var clfdate = require("helper/clfdate");
var User = require("models/user");
var eachUser = require("../../scripts/each/user");
var Delete = require("dashboard/account/delete");
var subscriptionLifecycle = require("models/user/subscriptionLifecycle");

function deleteUserAccount(user, callback) {
  var req = { user: user };
  var res = {};

  async.applyEachSeries(
    [Delete.exports.subscription, Delete.exports.blogs, Delete.exports.user],
    req,
    res,
    callback
  );
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

          deleteUserAccount(user, function (deleteErr) {
            if (deleteErr) return next(deleteErr);
            deleted += 1;
            next();
          });
        });
      }

      if (!subscriptionLifecycle.deletionDue(user)) return next();

      deleteUserAccount(user, function (deleteErr) {
        if (deleteErr) return next(deleteErr);
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
