const config = require("config");
const fetch = require("node-fetch");
const User = require("models/user");
const express = require("express");
const paypal = new express.Router();

paypal.get("/", async (req, res, next) => {
  const { subscriptionID } = req.query;

  if (!subscriptionID) {
    return next(new Error("No subscription from PayPal"));
  }

  User.getByPayPalSubscriptionId(subscriptionID, async (err, user) => {
    if (err) return next(err);

    if (user && user.uid) return next(new Error("You already have an account"));

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

    const json = await response.json();

    req.session.paypal = json;
    req.session.email = json.subscriber.email_address;

    res.redirect("/sign-up/create-account");
  });
});

module.exports = paypal;
