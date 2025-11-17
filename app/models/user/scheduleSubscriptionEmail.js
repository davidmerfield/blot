var getById = require("./getById");
var email = require("helper/email");
var debug = require("debug")("blot:user:scheduleSubscriptionEmail");
const scheduler = require("node-schedule");
const scheduledNotifications = new Map();

// The number of days before a subscription is renewed or
// expired to send an email notification to the customer.
var DAYS_WARNING = 8;

module.exports = function (uid, callback) {
  var notificationDate;

  // Fetch the latest version of the user's subcription from the
  // database to determine when we should notify them of a renewal.
  getById(uid, function (err, user) {
    if (err) return callback(err);

    // This user does not have a subscription through Stripe
    if (!user || !user.subscription || !user.subscription.current_period_end)
      return callback();

    // This user has monthly billing – we don't send them a warning email since
    // 12 warning emails + 12 receipt emails per year is a little much.
    if (user.subscription.plan && user.subscription.plan.interval === "month")
      return callback();

    // Stripe uses a seconds timestamp vs. JavaScript's ms
    notificationDate = new Date(user.subscription.current_period_end * 1000);

    // Subtract the number of days warning we'd like to give to user
    // Right now we tell them a week in advance of a renewal or expiry
    notificationDate.setDate(notificationDate.getDate() - DAYS_WARNING);

    debug(user.uid, user.email, "needs to be notified on", notificationDate);

    const existing = scheduledNotifications.get(uid);

    // When the server starts, we schedule a notification email for every user
    // If they should have been notified in the past, we stop now since we
    // don't want to email the user more than once.
    if (notificationDate.getTime() < Date.now()) {
      if (existing) {
        existing.cancel();
        scheduledNotifications.delete(uid);
      }

      debug(user.email, "should already been notified on", notificationDate);
      return callback();
    }

    if (existing) {
      existing.cancel();
      scheduledNotifications.delete(uid);
    }

    const job = scheduler.scheduleJob(notificationDate, function () {
      // We fetch the latest state of the user's subscription
      // from the database in case the user's subscription
      // has changed since the time the server started.
      getById(uid, function (err, user) {
        // No callback now, that was called long ago
        if (!user || !user.subscription) {
          debug(uid, "There is no user!");
          return;
        }

        debug(user.id, user.email, "Time to notify the user!");

        if (user.subscription.cancel_at_period_end) {
          debug(
            user.uid,
            user.email,
            "Sending email about a subscription expiry...",
          );
          return email.UPCOMING_EXPIRY(uid);
        }

        if (user.subscription.status === "active") {
          debug(
            user.uid,
            user.email,
            "Sending email about a subscription renewal...",
          );
          return email.UPCOMING_RENEWAL(uid);
        }

        console.error(
          user.uid,
          user.email,
          "Not sure how to notify this user about their renewal!",
        );
      });
    });

    if (job) {
      scheduledNotifications.set(uid, job);

      job.on("run", function () {
        scheduledNotifications.delete(uid);
      });

      job.on("canceled", function () {
        scheduledNotifications.delete(uid);
      });
    }

    // Let the callee know the email is schedule
    debug(user.uid, user.email, "scheduled warning email....");
    console.log(
      "Scheduled subscription email on",
      notificationDate,
      "for",
      user.email,
    );
    callback();
  });
};
