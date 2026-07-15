const express = require("express");
const paypal = new express.Router();
const parser = require("body-parser");
const User = require("models/user");
const config = require("config");
const clfdate = require("helper/clfdate");
const subscriptionLifecycle = require("models/user/subscriptionLifecycle");

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

      const response = await fetch(
        `${config.paypal.api_base}/v1/billing/subscriptions/${subscriptionID}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": "en_US",
            "Authorization": `Basic ${Buffer.from(
              `${config.paypal.client_id}:${config.paypal.secret}`
            ).toString("base64")}`
          }
        }
      );

      const paypal = await response.json();

      const updates = { paypal };

      const shouldDisable = subscriptionLifecycle.shouldDisableFromPaypalSubscription(paypal);
      const shouldEnable = paypal.status === "ACTIVE" && user.isDisabled;

      if (shouldDisable) {
        return User.disable(user, updates, err => {
          if (err) return reject(err);
          resolve();
        });
      }

      if (shouldEnable) {
        return User.enable(user, updates, err => {
          if (err) return reject(err);
          resolve();
        });
      }

      User.set(user.uid, updates, err => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

paypal.updateSubscription = updateSubscription;

module.exports = paypal;
