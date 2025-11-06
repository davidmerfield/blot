const express = require("express");
const paypal = new express.Router();
const parser = require("body-parser");
const User = require("models/user");
const config = require("config");
const clfdate = require("helper/clfdate");
const Delete = require("dashboard/account/delete");

const buildPaypalAuthHeader =
  (Delete.exports && Delete.exports.buildPaypalAuthHeader) ||
  function () {
    return `Basic ${Buffer.from(
      `${config.paypal.client_id}:${config.paypal.secret}`
    ).toString("base64")}`;
  };

const SUBSCRIPTION_EVENTS = [
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.RE-ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CREATED"
];

const prefix = () => `${clfdate()} PayPal Webhook:`;

paypal.post("/", parser.json(), async (req, res) => {
  // if the webhook is for a subscription-related event
  // update the subscription
  if (SUBSCRIPTION_EVENTS.includes(req.body.event_type)) {
    // pass the subscription ID to the updateSubscription function
    console.log(prefix(), req.body.event_type, req.body.resource.id);

    try {
      console.log(prefix(), "Updating subscriptionID=", req.body.resource.id);
      await updateSubscription(req.body.resource.id);
      console.log(prefix(), "Updated subscription successfully");
    } catch (err) {
      console.log(prefix(), err);
    }
  } else {
    console.log(prefix(), "Unhandled event", req.body);
  }

  res.status(200).send("OK");
});

const updateSubscription = async subscriptionID => {
  return new Promise((resolve, reject) => {
    User.getByPayPalSubscriptionId(subscriptionID, async (err, user) => {
      if (err) return reject(err);

      if (!user)
        return reject(
          new Error("No user associated with subscription ID " + subscriptionID)
        );

      const authHeader = buildPaypalAuthHeader();
      const response = await fetch(
        `${config.paypal.api_base}/v1/billing/subscriptions/${subscriptionID}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": "en_US",
            Authorization: authHeader,
          },
        }
      );

      const paypal = await response.json();

      const status = paypal && paypal.status;
      const updates = { paypal };

      let handler = (next) => User.set(user.uid, updates, next);

      if (status === "SUSPENDED") {
        updates.pause = buildPauseState("paypal", true);
        handler = (next) => User.disable(user, updates, next);
      } else if (status === "ACTIVE" || status === "RE-ACTIVATED") {
        updates.pause = buildPauseState("paypal", false);
        handler = (next) => User.enable(user, updates, next);
      } else if (user.pause && user.pause.active) {
        updates.pause = buildPauseState("paypal", false);
      }

      handler((handlerErr) => {
        if (handlerErr) return reject(handlerErr);
        resolve();
      });
    });
  });
};

paypal.updateSubscription = updateSubscription;

module.exports = paypal;

function buildPauseState(provider, active) {
  return {
    active: !!active,
    provider: provider || null,
    updatedAt: new Date().toISOString(),
  };
}
