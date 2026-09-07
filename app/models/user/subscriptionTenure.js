var subscriptionLifecycle = require("./subscriptionLifecycle");

function stripeTenureStartMs(user) {
  var subscription = user && user.subscription;
  if (!subscription || !subscription.customer) return null;

  return (
    subscriptionLifecycle.toMs(subscription.created) ||
    subscriptionLifecycle.toMs(subscription.current_period_start)
  );
}

function paypalTenureStartMs(user) {
  var paypal = user && user.paypal;
  if (!paypal || !paypal.id) return null;

  return subscriptionLifecycle.toMs(paypal.start_time);
}

function getSubscriptionDurationMs(user, now) {
  now = typeof now === "number" ? now : Date.now();

  var starts = [stripeTenureStartMs(user), paypalTenureStartMs(user)].filter(
    function (value) {
      return typeof value === "number" && value > 0;
    }
  );

  if (!starts.length) return null;

  var start = starts.reduce(function (earliest, candidate) {
    return candidate < earliest ? candidate : earliest;
  }, starts[0]);

  if (start >= now) return null;

  return now - start;
}

module.exports = {
  getSubscriptionDurationMs: getSubscriptionDurationMs,
  paypalTenureStartMs: paypalTenureStartMs,
  stripeTenureStartMs: stripeTenureStartMs,
};
