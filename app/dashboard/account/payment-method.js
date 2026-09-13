var Express = require("express");
var PaymentMethod = new Express.Router();
var User = require("models/user");
var syncPaymentMethods = require("models/user/syncPaymentMethods");
var markPaymentMethodExpiry = require("models/user/paymentMethodExpiry");
var config = require("config");
var email = require("helper/email");

var BRAND_NAMES = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay"
};

function presentPaymentMethods(req, paymentMethods) {
  markPaymentMethodExpiry(paymentMethods);

  return paymentMethods.map(function (paymentMethod) {
    return Object.assign({}, paymentMethod, {
      brandPretty: BRAND_NAMES[paymentMethod.brand] || "Card",
      defaultUrl: req.baseUrl + "/" + paymentMethod.id + "/default",
      removeUrl: req.baseUrl + "/" + paymentMethod.id + "/remove"
    });
  });
}

// Shared with models/user/syncPaymentMethods so both this route and the
// cache-refresh helper always talk to the same (or, in tests, the same
// mocked) Stripe client.
var getStripeClient = syncPaymentMethods.getClient;

// This page lets Stripe subscribers view, add, remove, and choose the
// default payment method Stripe uses to charge their subscription. PayPal
// subscribers are directed to manage their payment method on PayPal, since
// Blot does not control billing for PayPal subscriptions.
PaymentMethod.use(function (req, res, next) {
  if (req.user.paypal && req.user.paypal.status) {
    // The list page explains where to go instead; every mutating
    // action (add/remove/set default) is simply unavailable.
    if (req.method === "GET") return next();
    return next(new Error("Manage your payment method on PayPal"));
  }

  // User has never had a Stripe subscription, so there's
  // nothing here for them to manage.
  if (!req.user.subscription || !req.user.subscription.customer)
    return res.redirect(req.baseUrl);

  next();
});

PaymentMethod.route("/")

  .get(function (req, res, next) {
    if (req.user.paypal && req.user.paypal.status) {
      return res.render("dashboard/account/payment-method", {
        breadcrumb: "Payment methods",
        title: "Payment methods",
        paypal: true
      });
    }

    syncPaymentMethods(req.user, function (err, paymentMethods) {
      if (err) return next(err);

      res.render("dashboard/account/payment-method", {
        stripe_key: config.stripe.key,
        breadcrumb: "Payment methods",
        title: "Payment methods",
        paymentMethods: presentPaymentMethods(req, paymentMethods),
        hasPaymentMethods: paymentMethods.length > 0
      });
    });
  })

  // Stripe.js has already tokenized the new card on the client (see
  // account-card-form.js). We turn that token into a PaymentMethod and
  // attach it to the customer.
  .post(function (req, res, next) {
    if (!req.body.stripeToken) return next(new Error("No card details submitted"));

    var stripe = getStripeClient();
    if (!stripe) return next(new Error("Stripe is not configured"));

    stripe.paymentMethods.create(
      { type: "card", card: { token: req.body.stripeToken } },
      function (err, paymentMethod) {
        if (err) return next(err);

        stripe.paymentMethods.attach(
          paymentMethod.id,
          { customer: req.user.subscription.customer },
          function (err) {
            if (err) {
              err.code = err.code || "resource_missing";
              return next(err);
            }

            req.newPaymentMethodId = paymentMethod.id;
            next();
          }
        );
      }
    );
  })

  // Somehow the Stripe customer this Blot account points at no longer
  // exists. Recreate a customer and subscription for the card they just
  // entered, without charging them right now, mirroring the recovery the
  // old card-update flow performed.
  .post(function (err, req, res, next) {
    if (err.code !== "resource_missing") return next(err);

    var stripe = getStripeClient();

    stripe.customers.create(
      {
        card: req.body.stripeToken,
        email: req.user.email,
        plan: req.user.subscription.plan && req.user.subscription.plan.id,
        quantity: 0,
        description: "Blot subscription"
      },
      function (err, customer) {
        if (err) return next(err);

        stripe.customers.updateSubscription(
          customer.subscription.customer,
          customer.subscription.id,
          { quantity: req.user.blogs.length || 1, prorate: false },
          function (err, subscription) {
            if (err) return next(err);

            User.set(req.user.uid, { subscription: subscription }, function (err) {
              if (err) return next(err);

              email.UPDATE_BILLING(req.user.uid);
              res.message(req.baseUrl, "Your payment method was added");
            });
          }
        );
      }
    );
  })

  // If this is the customer's only payment method, make it the default so
  // it actually gets used to charge the subscription.
  .post(function (req, res, next) {
    var stripe = getStripeClient();

    syncPaymentMethods(req.user, function (err, paymentMethods) {
      if (err) return next(err);

      var alreadyHasDefault = paymentMethods.some(function (pm) {
        return pm.isDefault && pm.id !== req.newPaymentMethodId;
      });

      if (alreadyHasDefault) {
        email.UPDATE_BILLING(req.user.uid);
        return res.message(req.baseUrl, "Your payment method was added");
      }

      makeDefault(stripe, req.user, req.newPaymentMethodId, function (err) {
        if (err) return next(err);

        syncPaymentMethods(req.user, function (err) {
          if (err) return next(err);

          email.UPDATE_BILLING(req.user.uid);
          res.message(req.baseUrl, "Your payment method was added");
        });
      });
    });
  });

PaymentMethod.route("/:id/default").post(function (req, res, next) {
  var stripe = getStripeClient();
  if (!stripe) return next(new Error("Stripe is not configured"));

  findOwnedPaymentMethod(req.user, req.params.id, function (err, paymentMethod) {
    if (err) return next(err);
    if (!paymentMethod) return next(new Error("Payment method not found"));

    if (paymentMethod.isDefault)
      return res.message(req.baseUrl, "That's already your default payment method");

    makeDefault(stripe, req.user, paymentMethod.id, function (err) {
      if (err) return next(err);

      syncPaymentMethods(req.user, function (err) {
        if (err) return next(err);

        res.message(req.baseUrl, "Updated your default payment method");
      });
    });
  });
});

PaymentMethod.route("/:id/remove").post(function (req, res, next) {
  var stripe = getStripeClient();
  if (!stripe) return next(new Error("Stripe is not configured"));

  findOwnedPaymentMethod(req.user, req.params.id, function (
    err,
    paymentMethod,
    paymentMethods
  ) {
    if (err) return next(err);
    if (!paymentMethod) return next(new Error("Payment method not found"));

    // Best practice: a default payment method can't be removed directly -
    // the customer has to choose a different default first. When it's also
    // their only payment method, removing it would leave nothing on file
    // to charge their subscription, so we're explicit about that instead.
    if (paymentMethod.isDefault) {
      return next(
        new Error(
          paymentMethods.length <= 1
            ? "This is your only payment method. Removing it would cancel your subscription - add another payment method first, or cancel your subscription instead."
            : "Your default payment method can't be removed. Set a different payment method as default first."
        )
      );
    }

    var detach = paymentMethod.isLegacy
      ? function (cb) {
          stripe.customers.deleteCard(
            req.user.subscription.customer,
            paymentMethod.id,
            cb
          );
        }
      : function (cb) {
          stripe.paymentMethods.detach(paymentMethod.id, cb);
        };

    detach(function (err) {
      if (err) return next(err);

      syncPaymentMethods(req.user, function (err) {
        if (err) return next(err);

        res.message(req.baseUrl, "Removed your payment method");
      });
    });
  });
});

// We only ever act on a payment method we've just fetched from Stripe for
// this user's own customer id - this stops one user from acting on another
// user's payment method by guessing an id in the URL.
function findOwnedPaymentMethod(user, id, callback) {
  syncPaymentMethods(user, function (err, paymentMethods) {
    if (err) return callback(err);

    var match = paymentMethods.find(function (pm) {
      return pm.id === id;
    });

    callback(null, match || null, paymentMethods);
  });
}

function makeDefault(stripe, user, paymentMethodId, callback) {
  stripe.customers.update(
    user.subscription.customer,
    { invoice_settings: { default_payment_method: paymentMethodId } },
    function (err) {
      if (err) return callback(err);

      if (!user.subscription.id) return callback();

      stripe.customers.updateSubscription(
        user.subscription.customer,
        user.subscription.id,
        { default_payment_method: paymentMethodId },
        callback
      );
    }
  );
}

// Handle our own POST errors rather than letting them bubble up to the
// generic Account error handler: that redirects to req.baseUrl + req.path,
// which for our /:id/default and /:id/remove actions is a POST-only URL
// with no GET handler, so it would 404 instead of showing the flash
// message. Redirecting to req.baseUrl (this page) always works. GET errors
// (e.g. Stripe being unreachable on page load) still render the normal
// dashboard error page.
PaymentMethod.use(function (err, req, res, next) {
  if (req.method === "GET") return next(err);
  res.message(req.baseUrl, err);
});

module.exports = PaymentMethod;

module.exports._setStripeClient = syncPaymentMethods._setStripeClient;
module.exports._resetStripeClient = syncPaymentMethods._resetStripeClient;
