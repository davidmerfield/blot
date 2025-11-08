var Express = require("express");
var Subscription = new Express.Router();
var User = require("models/user");
var config = require("config");
var stripe = require("stripe")(config.stripe.secret);
var email = require("helper/email");
var prettyPrice = require("helper/prettyPrice");
var Delete = require("./delete");
const PLAN_MAP = config.stripe.plan_map;
const PAYPAL_PAUSE_REASON = "Customer requested pause";
const PAYPAL_RESUME_REASON = "Customer requested resume";

var buildPaypalAuthHeader =
  (Delete.exports && Delete.exports.buildPaypalAuthHeader) ||
  function () {
    return `Basic ${Buffer.from(
      `${config.paypal.client_id}:${config.paypal.secret}`
    ).toString("base64")}`;
  };

var stripeOverride;

function getStripeClient() {
  return stripeOverride || stripe;
}

Subscription.route("/").get(function (req, res) {
  res.render("dashboard/account/subscription", {
    title: "Your account",
    monthly: req.user.isMonthly
  });
});

Subscription.use("/delete", Delete);

// The purpose of this page is to allow the user to update the
// card used by Stripe to charge their subscription fee
Subscription.route("/payment-method")

  .all(function (req, res, next) {
    // User does not have a payment method on file, so redirect them
    if (!req.user || !req.user.subscription || !req.user.subscription.plan)
      return res.redirect(req.baseUrl);

    return next();
  })

  .get(function (req, res) {
    res.render("dashboard/account/payment-method", {
      stripe_key: config.stripe.key,
      breadcrumb: "Edit payment method",
      title: "Edit payment information"
    });
  })

  .post(function (req, res, next) {
    // Stripe generates a token for a payment method
    // on the client. This token is passed to Blot
    // through the update payment method form. We store
    // this token to authenticate future charges.
    if (!req.body.stripeToken) {
      return next(new Error("No Stripe token"));
    }

    // We now store the new card token against the existing
    // subscription information for this customer
    stripe.customers.updateSubscription(
      req.user.subscription.customer,
      req.user.subscription.id,
      { card: req.body.stripeToken, quantity: req.user.subscription.quantity },
      function (err, subscription) {
        if (err) return next(err);

        if (subscription) req.latestSubscription = subscription;

        next();
      }
    );
  })

  // Sometimes, somehow, a customer is deleted on Stripe
  // but the Blot account exists. Not sure exactly what
  // causes this but it happened. This middleware will
  // create a new subscription and customer, without
  // charging the new payment information and then store
  // it against this blot user.
  .post(function (err, req, res, next) {
    // This is some other error, proceed.
    if (err.code !== "resource_missing") {
      return next(err);
    }

    // Make sure we use the user's old suscription
    // plan, in case Blot's price for new customers
    // has changed since they signed up.
    // Setting the quantity to zero will ensure the
    // customer is not charged right now.
    stripe.customers.create(
      {
        card: req.body.stripeToken,
        email: req.user.email,
        plan: req.user.subscription.plan.id,
        quantity: 0,
        description: "Blot subscription"
      },
      function (err, customer) {
        if (err) return next(err);

        // Now we ensure the new subscription has the correct
        // quantity. We couldn't do this earlier because it
        // would involve incorrectly charging the customer. If
        // we set prorate to false, they won't be charged now.
        stripe.customers.updateSubscription(
          customer.subscription.customer,
          customer.subscription.id,
          { quantity: req.user.blogs.length || 1, prorate: false },
          function (err, subscription) {
            if (err) return next(err);

            if (subscription) req.latestSubscription = subscription;

            next();
          }
        );
      }
    );
  })

  // This middleware will save a valid, updated
  // subscription with the new payment method.
  .post(function (req, res, next) {
    if (!req.latestSubscription) return next(new Error("No subscription"));

    User.set(
      req.user.uid,
      { subscription: req.latestSubscription },
      function (err) {
        if (err) return next(err);

        email.UPDATE_BILLING(req.user.uid);
        res.message(
          req.baseUrl,
          "Your payment information was updated successfully!"
        );
      }
    );
  });

Subscription.route("/pause")

  .all(requireSubscription)
  .all(requireNotPaused)
  .post(async function (req, res, next) {
    try {
      await pauseSubscriptionForUser(req.user);
      res.message(req.baseUrl, "Your subscription has been paused");
    } catch (err) {
      next(err);
    }
  });

Subscription.route("/resume")

  .all(requireSubscription)
  .all(requirePaused)
  .get(function (req, res) {
    res.render("dashboard/account/resume", {
      title: "Resume your subscription",
      breadcrumb: "Resume",
    });
  })
  .post(async function (req, res, next) {
    try {
      await resumeSubscriptionForUser(req.user);
      res.message(req.baseUrl, "Your subscription has been resumed");
    } catch (err) {
      next(err);
    }
  });

Subscription.route("/cancel")

  .all(requireSubscription)

  .get(function (req, res) {
    res.render("dashboard/account/cancel", {
      title: "Cancel your subscription"
    });
  })

  .post(
    cancelStripeSubscription,
    cancelPaypalSubscription,
    function (req, res) {
      email.CANCELLED(req.user.uid);
      res.message(req.baseUrl, "Your subscription has been cancelled");
    }
  );

Subscription.route("/billing-interval")

  .all(requireSubscription)

  .all(retrieveSubscription)

  .all(determineNewPlan)

  .get(function (req, res) {
    let credit;
    let proration;
    let now = Date.now() / 1000;
    let monthly =
      req.user.subscription &&
      req.user.subscription.plan &&
      req.user.subscription.plan.interval === "month";

    let new_plan_amount_integer =
      parseInt(req.new_plan_id.split("_").pop()) * 100;
    let new_amount = prettyPrice(
      new_plan_amount_integer * req.user.subscription.quantity
    );
    let percentage =
      (req.user.subscription.current_period_end - now) /
      (req.user.subscription.current_period_end -
        req.user.subscription.current_period_start);

    if (monthly) {
      proration = prettyPrice(
        new_plan_amount_integer * req.user.subscription.quantity -
          percentage *
            req.user.subscription.plan.amount *
            req.user.subscription.quantity
      );
    } else {
      credit = prettyPrice(
        percentage *
          req.user.subscription.plan.amount *
          req.user.subscription.quantity -
          new_plan_amount_integer * req.user.subscription.quantity
      );
    }

    res.render("dashboard/account/billing-interval", {
      title: "Switch your subscription interval",
      proration: proration,
      credit: credit,
      monthly: monthly,
      new_amount: new_amount
    });
  })

  .post(function (req, res, next) {
    stripe.customers.updateSubscription(
      req.user.subscription.customer,
      req.user.subscription.id,
      {
        quantity: req.user.subscription.quantity,
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        plan: req.new_plan_id
      },
      function (err, subscription) {
        if (err) {
          return next(err);
        }

        if (!subscription) {
          return next(new Error("No subscription"));
        }

        User.set(req.user.uid, { subscription: subscription }, function (err) {
          if (err) {
            return next(err);
          }

          email.BILLING_INTERVAL(req.user.uid);
          res.message(
            req.baseUrl,
            "You are now billed once a " +
              (subscription.plan.interval === "month" ? "month" : "year")
          );
        });
      }
    );
  });

Subscription.route("/create")

  .all(requireLackOfSubscription)

  .get(function (req, res) {
    res.locals.price =
      "$" +
      parseInt(config.stripe.plan.split("_").pop()) * req.user.blogs.length;
    res.locals.interval =
      config.stripe.plan.indexOf("monthly") === 0 ? "month" : "year";
    res.locals.stripe_key = config.stripe.key;
    res.render("dashboard/account/create-subscription", {
      title: "Create subscription",
      breadcrumb: "Create subscription"
    });
  })

  .post(createStripeSubscription, function (req, res) {
    email.CREATED_BLOG(req.user.uid);
    res.message(req.baseUrl, "You created a subscription");
  });

Subscription.route("/restart")

  .all(retrieveSubscription)

  .all(requireCancelledSubscription)

  .get(function (req, res) {
    res.render("dashboard/account/restart", {
      title: "Restart your subscription",
      breadcrumb: "Restart"
    });
  })

  .post(restartStripeSubscription, function (req, res) {
    email.RESTART(req.user.uid);
    res.message(req.baseUrl, "Restarted your subscription");
  });

Subscription.route("/restart/pay")

  .all(requireCancelledSubscription)

  .get(function (req, res) {
    res.render("dashboard/account/restart-pay", {
      title: "Restart your subscription",
      stripe_key: config.stripe.key,
      breadcrumb: "Restart"
    });
  })

  .post(recreateStripeSubscription, function (req, res) {
    email.RESTART(req.user.uid);
    res.message(req.baseUrl, "Restarted your subscription");
  });

function determineNewPlan (req, res, next) {
  let new_plan_id = PLAN_MAP[req.user.subscription.plan.id];

  if (!new_plan_id) return next(new Error("You cannot switch your plan"));

  req.new_plan_id = new_plan_id;

  return next();
}

function requireCancelledSubscription (req, res, next) {
  // Make sure the user has a subscription
  // otherwise they have nothing to cancel
  if (!req.user.isSubscribed) {
    next();
  } else {
    res.redirect("/account/subscription");
  }
}

function requireLackOfSubscription (req, res, next) {
  // Make sure the user does not have a subscription
  // otherwise they might create multiple
  if (!req.user.subscription || !req.user.subscription.customer) {
    next();
  } else {
    res.redirect("/account/subscription");
  }
}

function requireSubscription (req, res, next) {
  // Make sure the user has a subscription
  // otherwise they have nothing to cancel
  if (req.user.isSubscribed) {
    next();
  } else if (req.user.subscription && req.user.subscription.customer) {
    res.redirect("/account/restart");
  } else {
    res.redirect("/account/subscription");
  }
}

function requirePaused (req, res, next) {
  if (req.user.isPaused) return next();

  return res.message(req.baseUrl, "Your subscription is already active");
}

function requireNotPaused (req, res, next) {
  if (!req.user.isPaused) return next();

  return res.message(req.baseUrl, "Your subscription is already paused");
}

async function cancelPaypalSubscription (req, res, next) {
  next();
}

function cancelStripeSubscription (req, res, next) {
  if (!req.user.subscription.customer) return next();

  stripe.customers.cancelSubscription(
    req.user.subscription.customer,
    req.user.subscription.id,
    { at_period_end: true },
    function (err, subscription) {
      if (err) return next(err);

      if (!subscription) return next(new Error("No subscription"));

      User.set(req.user.uid, { subscription: subscription }, next);
    }
  );
}

// If the customer's subscription has expired it will
// not be possible for them to restart it. Instead
// we create a new one for them.
function recreateStripeSubscription (req, res, next) {
  stripe.customers.update(
    req.user.subscription.customer,
    {
      card: req.body.stripeToken
    },
    function (err) {
      if (err) return next(err);

      stripe.customers.createSubscription(
        req.user.subscription.customer,
        {
          plan: req.user.subscription.plan.id,
          quantity: req.user.subscription.quantity || 1
        },
        function (err, subscription) {
          if (err || !subscription) {
            return next(err || new Error("No subscription"));
          }

          User.set(req.user.uid, { subscription: subscription }, next);
        }
      );
    }
  );
}

// If I created a blog for the customer manually they will
// not have a stripe subscription. In order to create new
// blogs they will need one.
function createStripeSubscription (req, res, next) {
  stripe.customers.create(
    {
      card: req.body.stripeToken,
      email: req.user.email,
      plan: config.stripe.plan,
      quantity: req.user.blogs.length,
      description: "Blot subscription"
    },
    function (err, customer) {
      if (err) return next(err);

      User.set(req.user.uid, { subscription: customer.subscription }, next);
    }
  );
}

function retrieveSubscription (req, res, next) {
  if (!req.user.subscription.customer) return next();

  stripe.customers.retrieveSubscription(
    req.user.subscription.customer,
    req.user.subscription.id,
    function (err, subscription) {
      if (err && err.code === "resource_missing") {
        return res.redirect("/account/subscription/restart/pay");
      }

      if (err) return next(err);

      if (!subscription) return next(new Error("No subscription"));

      User.set(req.user.uid, { subscription: subscription }, function (err) {
        if (err) return next(err);

        next();
      });
    }
  );
}

function restartStripeSubscription (req, res, next) {
  if (!req.user.subscription.customer) return next();
  stripe.customers.updateSubscription(
    req.user.subscription.customer,
    req.user.subscription.id,
    {},
    function (err, subscription) {
      if (err) {
        return next(err);
      }

      if (!subscription) {
        return next(new Error("No subscription"));
      }

      User.set(req.user.uid, { subscription: subscription }, next);
    }
  );
}

async function pauseSubscriptionForUser (user) {
  ensureUser(user);

  if (user.paypal && user.paypal.id) {
    return pausePaypalSubscription(user);
  }

  if (user.subscription && user.subscription.id) {
    return pauseStripeSubscription(user);
  }

  throw new Error("No subscription to pause");
}

async function resumeSubscriptionForUser (user) {
  ensureUser(user);

  if (user.paypal && user.paypal.id) {
    return resumePaypalSubscription(user);
  }

  if (user.subscription && user.subscription.id) {
    return resumeStripeSubscription(user);
  }

  throw new Error("No subscription to resume");
}

async function pauseStripeSubscription (user) {
  ensureStripeSubscription(user);

  var client = getStripeClient();

  if (!client || !client.subscriptions || !client.subscriptions.update)
    throw new Error("Stripe client unavailable");

  var subscription = await client.subscriptions.update(
    user.subscription.id,
    { pause_collection: { behavior: "mark_uncollectible" } }
  );

  if (!subscription) throw new Error("No subscription");

  await disableUserAccount(
    user,
    {
      subscription: subscription,
      pause: buildPauseState("stripe", true),
    }
  );

  return subscription;
}

async function resumeStripeSubscription (user) {
  ensureStripeSubscription(user);

  var client = getStripeClient();

  if (!client || !client.subscriptions || !client.subscriptions.update)
    throw new Error("Stripe client unavailable");

  var subscription = await client.subscriptions.update(user.subscription.id, {
    pause_collection: null,
  });

  if (!subscription) throw new Error("No subscription");

  await enableUserAccount(
    user,
    {
      subscription: subscription,
      pause: buildPauseState("stripe", false),
    }
  );

  return subscription;
}

async function pausePaypalSubscription (user) {
  ensurePaypalSubscription(user);

  var authHeader = buildPaypalAuthHeader();
  var suspendResponse = await fetch(
    `${config.paypal.api_base}/v1/billing/subscriptions/${user.paypal.id}/suspend`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: PAYPAL_PAUSE_REASON }),
    }
  );

  await ensurePaypalSuccess(
    suspendResponse,
    "Unable to suspend PayPal subscription"
  );

  var paypal = await fetchPaypalSubscription(user.paypal.id, authHeader);

  await disableUserAccount(
    user,
    {
      paypal: paypal,
      pause: buildPauseState("paypal", true),
    }
  );

  return paypal;
}

async function resumePaypalSubscription (user) {
  ensurePaypalSubscription(user);

  var authHeader = buildPaypalAuthHeader();
  var resumeResponse = await fetch(
    `${config.paypal.api_base}/v1/billing/subscriptions/${user.paypal.id}/activate`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: PAYPAL_RESUME_REASON }),
    }
  );

  await ensurePaypalSuccess(
    resumeResponse,
    "Unable to resume PayPal subscription"
  );

  var paypal = await fetchPaypalSubscription(user.paypal.id, authHeader);

  await enableUserAccount(
    user,
    {
      paypal: paypal,
      pause: buildPauseState("paypal", false),
    }
  );

  return paypal;
}

async function fetchPaypalSubscription (subscriptionId, authHeader) {
  var response = await fetch(
    `${config.paypal.api_base}/v1/billing/subscriptions/${subscriptionId}`,
    {
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en_US",
        Authorization: authHeader,
      },
    }
  );

  if (!response.ok) {
    await paypalError(response, "Unable to fetch PayPal subscription");
  }

  return response.json();
}

async function ensurePaypalSuccess (response, prefix) {
  if (response && response.ok) return;

  await paypalError(response, prefix);
}

async function paypalError (response, prefix) {
  if (!response) throw new Error(prefix);

  var message = `${prefix}: ${response.status}`;

  try {
    var body = await response.json();
    if (body && (body.message || body.name)) {
      message = `${prefix}: ${body.message || body.name}`;
    }
  } catch (e) {
    try {
      var text = await response.text();
      if (text) message = `${prefix}: ${text}`;
    } catch (_) {}
  }

  throw new Error(message);
}

function buildPauseState (provider, active) {
  return {
    active: !!active,
    provider: provider || null,
    updatedAt: new Date().toISOString(),
  };
}

function disableUserAccount (user, updates) {
  return new Promise(function (resolve, reject) {
    User.disable(user, Object.assign({}, updates), function (err) {
      if (err) return reject(err);

      resolve();
    });
  });
}

function enableUserAccount (user, updates) {
  return new Promise(function (resolve, reject) {
    User.enable(user, Object.assign({}, updates), function (err) {
      if (err) return reject(err);

      resolve();
    });
  });
}

function ensureUser (user) {
  if (!user || !user.uid) throw new Error("No user");
}

function ensureStripeSubscription (user) {
  ensureUser(user);

  if (!user.subscription || !user.subscription.id)
    throw new Error("No Stripe subscription");
}

function ensurePaypalSubscription (user) {
  ensureUser(user);

  if (!user.paypal || !user.paypal.id)
    throw new Error("No PayPal subscription");
}

if (Subscription.exports !== undefined)
  throw new Error(
    "Subscription.exports is defined (typeof=" +
      typeof Subscription.exports +
      ") Would clobber Subscription.exports"
  );

Subscription.exports = {
  pauseStripe: pauseStripeSubscription,
  resumeStripe: resumeStripeSubscription,
  pausePaypal: pausePaypalSubscription,
  resumePaypal: resumePaypalSubscription,
  pauseUser: pauseSubscriptionForUser,
  resumeUser: resumeSubscriptionForUser,
  buildPauseState: buildPauseState,
};

Subscription._setStripeClient = function (client) {
  stripeOverride = client;
};

Subscription._resetStripeClient = function () {
  stripeOverride = null;
};

module.exports = Subscription;
