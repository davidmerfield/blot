/*

SIGNUP SUCCESS
customer.created
invoice.created
invoice.payment_succeeded
customer.card.created
charge.succeeded
customer.subscription.created

SIGNUP FAILED
charge.failed

UPDATE PAYMENT METHOD
customer.card.deleted
customer.card.created
customer.updated
customer.subscription.updated

CANCEL SUBSCRIPTION
customer.subscription.updated

RENEW SUCCESS
invoice.created
customer.subscription.updated
invoice.payment_succeeded
charge.succeeded
customer.updated IF prev failed renew attempt then

RENEW FAIL
invoice.created
customer.subscription.updated
invoice.payment_failed
charge.failed
customer.updated to set delinquent flag
invoice.updated to track attempted charges
customer.subscription.updated IF NOT FINAL CHARGE ATTEMPT
customer.subscription.deleted IF IS FINAL CHARGE ATTEMPT


*/

var parser = require("body-parser");
var Express = require("express");
var config = require("config");
var email = require("helper/email");
var User = require("models/user");

var webhooks = Express.Router();

// Stripe event codes
var UPDATED_SUBSCRIPTION = "customer.subscription.updated";
var DELETED_SUBSCRIPTION = "customer.subscription.deleted";

// Error messages
var NO_SUBSCRIPTION = "No subscription retrieved from Stripe";
var NO_USER = "No user retrieved from the database";

// Stripe sends us a webhook when user subscriptions change
// Some reasons they might change:
// - Renewal payment fails
// - I make some change to a user subscription directly on the
//   Stripe dashboard, this webhook tells Blot to pull the latest
//   state from Stripe.
// - There are probably other things I'm missing....

webhooks.post("/", parser.json(), function (req, res) {
  // Down for maintenance, Stripe should
  // back off and try again later.
  if (config.maintenance) return res.sendStatus(503);

  var event = req.body;
  var event_data = event.data.object;

  // A customer's subscription was changed, save changed info
  if (event.type === UPDATED_SUBSCRIPTION || event.type === DELETED_SUBSCRIPTION)
    update_subscription(event_data.customer, event_data, function () {});

  return res.sendStatus(200);
});

function update_subscription(customer_id, subscription, callback) {
  callback = callback || function () {};

  if (!subscription) return callback(new Error(NO_SUBSCRIPTION));

  User.getByCustomerId(customer_id, function (err, user) {
    if (err || !user) return callback(err || new Error(NO_USER));

    var previousSubscription = user.subscription || {};

    if (subscription.status === "canceled" && user.isDisabled)
      email.ALREADY_CANCELLED(user.uid);

    if (subscription.status === "canceled" && !user.isDisabled)
      email.CLOSED(user.uid);

    if (subscription.status === "past_due") email.OVERDUE(user.uid);

    if (
      subscription.status === "active" &&
      (previousSubscription.status === "past_due" ||
        previousSubscription.status === "unpaid")
    )
      email.RECOVERED(user.uid);

    if (
      subscription.status === "unpaid" &&
      previousSubscription.status !== "unpaid"
    )
      email.OVERDUE_CLOSURE(user.uid);

    var updates = { subscription: subscription };
    var handler = function (next) {
      User.set(user.uid, updates, next);
    };

    if (subscription.status === "canceled") {
      handler = function (next) {
        User.disable(user, updates, next);
      };
    }

    handler(callback);
  });
}

module.exports = webhooks;
module.exports.update_subscription = update_subscription;
