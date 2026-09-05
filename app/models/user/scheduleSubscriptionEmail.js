var getById = require("./getById");
var email = require("helper/email");
var debug = require("debug")("blot:user:scheduleSubscriptionEmail");
const scheduler = require("node-schedule");
const scheduledNotifications = new Map();

// The number of days before a subscription is renewed or
// expired to send an email notification to the customer.
var DAYS_WARNING = 8;
var SECONDS_IN_DAY = 24 * 60 * 60;
var MIN_MONTH_SECONDS = 27 * SECONDS_IN_DAY;
var MAX_MONTH_SECONDS = 32 * SECONDS_IN_DAY;

function roughlyOneMonth (seconds) {
  return seconds >= MIN_MONTH_SECONDS && seconds <= MAX_MONTH_SECONDS;
}

function isFirstMonthlyRenewal (subscription) {
  if (!subscription || !subscription.plan || subscription.plan.interval !== "month")
    return false;

  var created = subscription.created;
  var periodStart = subscription.current_period_start;
  var periodEnd = subscription.current_period_end;

  if (!created || !periodStart || !periodEnd) return false;

  var currentPeriodLength = periodEnd - periodStart;
  var timeFromStartToRenewal = periodEnd - created;

  return (
    roughlyOneMonth(currentPeriodLength) &&
    roughlyOneMonth(timeFromStartToRenewal)
  );
}

module.exports = function (uid, callback) {
  var notificationDate;

  // Fetch the latest version of the user's subcription from the
  // database to determine when we should notify them of a renewal.
  getById(uid, function (err, user) {
    if (err) return callback(err);

    // This user does not have a subscription through Stripe
    if (!user || !user.subscription || !user.subscription.current_period_end)
      return callback();

    // For monthly subscriptions, we only send a warning for the first renewal.
    if (
      user.subscription.plan &&
      user.subscription.plan.interval === "month" &&
      !isFirstMonthlyRenewal(user.subscription)
    )
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
            "Sending email about a subscription expiry..."
          );
          return email.UPCOMING_EXPIRY(uid);
        }

        if (user.subscription.status === "active") {
          if (isFirstMonthlyRenewal(user.subscription)) {
            debug(
              user.uid,
              user.email,
              "Sending email about a first monthly subscription renewal..."
            );
            return email.UPCOMING_MONTHLY_FIRST_RENEWAL(uid);
          }

          debug(
            user.uid,
            user.email,
            "Sending email about a subscription renewal..."
          );
          return email.UPCOMING_RENEWAL(uid);
        }

        console.error(
          user.uid,
          user.email,
          "Not sure how to notify this user about their renewal!"
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
      user.email
    );
    callback();
  });
};
