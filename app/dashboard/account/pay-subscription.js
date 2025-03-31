var config = require("config");
var async = require("async");
var stripe = require("stripe")(config.stripe.secret);
var User = require("models/user");
var prettyPrice = require("helper/prettyPrice");
var Express = require("express");
var PaySubscription = new Express.Router();

PaySubscription.route("/")

  // First, make sure the customer has a subscription
  // through Stripe, then fetch its latest state. We
  // typically recieve the latest version of a subscription
  // through Stripe's webhooks – this is just a double-check.
  .all(checkCustomer)
  .all(updateSubscription)

  // We want to tell the user how much they will have to pay to
  // re-open their account, so work that out before rendering
  // the payment form on the dashboard.
  .get(listUnpaidInvoices)
  .get(function (req, res) {
    res.render("dashboard/account/pay-subscription", {
      stripe_key: config.stripe.key,
      title: "Restart subscription",
    });
  })

  // The user must submit a valid card to restart their account
  // Then we list all outstanding invoices and pay them.
  .post(updateCard)
  .post(payUnpaidInvoices)
  .post(updateSubscription)
  .post(function (req, res) {
    res.message("/sites", "Payment recieved, thank you!");
  });

function checkCustomer(req, res, next) {
  req.customer = req.user.subscription && req.user.subscription.customer;
  req.subscription = req.user.subscription && req.user.subscription.id;

  if (!req.customer) {
    return res.message("/sites", "You are not a customer!");
  }

  if (!req.subscription) {
    return res.message("/sites", "You need to have a subscription!");
  }

  next();
}

function listUnpaidInvoices(req, res, next) {
  stripe.invoices.list({ customer: req.customer }, function (err, invoices) {
    if (err) return next(err);

    res.locals.amountDue = 0;

    invoices.data.forEach(function (invoice) {
      if (invoice.paid === false) res.locals.amountDue += invoice.amount_due;
    });

    if (!res.locals.amountDue) {
      return res.message("/sites", "Thank you, your account is in good standing!");
    }

    res.locals.amountDue = prettyPrice(res.locals.amountDue);

    next();
  });
}

function updateCard(req, res, next) {
  var stripeToken = req.body.stripeToken;

  if (!stripeToken) return next(new Error("No card token passed"));

  stripe.customers.update(req.customer, { card: stripeToken }, next);
}

function payUnpaidInvoices(req, res, next) {
  stripe.invoices.list({ customer: req.customer }, function (err, invoices) {
    if (err) return next(err);

    async.eachSeries(
      invoices.data,
      function (invoice, nextInvoice) {
        if (invoice.paid) return nextInvoice();

        // You can only pay an invoice once
        stripe.invoices.pay(invoice.id, nextInvoice);
      },
      next
    );
  });
}

function updateSubscription(req, res, next) {
  stripe.customers.retrieveSubscription(
    req.user.subscription.customer,
    req.user.subscription.id,
    function (err, subscription) {
      if (err) return next(err);

      if (!subscription) return next(new Error("No subscription"));

      User.set(req.user.uid, { subscription: subscription }, function (err) {
        if (err) return next(err);

        next();
      });
    }
  );
}

module.exports = PaySubscription;
