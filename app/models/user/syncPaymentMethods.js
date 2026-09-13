var config = require("config");
var createStripe = require("stripe");
var set = require("./set");

var stripeClient;

function getStripeClient() {
  if (stripeClient) return stripeClient;

  if (!config.stripe || !config.stripe.secret) return null;

  stripeClient = createStripe(config.stripe.secret);

  // Pin an API version that supports the PaymentMethods resource and
  // customer.invoice_settings.default_payment_method, regardless of
  // whichever version is configured as the account default on Stripe.
  if (stripeClient.setApiVersion) stripeClient.setApiVersion("2020-08-27");

  return stripeClient;
}

// Legacy Card objects use title-cased brand names ("Visa", "American
// Express"); modern PaymentMethod objects use lowercase slugs ("visa",
// "amex"). Normalize to the latter so the view/CSS only need to know one
// vocabulary.
var LEGACY_BRANDS = {
  Visa: "visa",
  MasterCard: "mastercard",
  Mastercard: "mastercard",
  "American Express": "amex",
  Discover: "discover",
  "Diners Club": "diners",
  JCB: "jcb",
  UnionPay: "unionpay"
};

function normalizeBrand(brand) {
  return LEGACY_BRANDS[brand] || (brand || "").toLowerCase();
}

function buildPaymentMethod(pm, defaultId) {
  return {
    id: pm.id,
    brand: pm.card.brand,
    last4: pm.card.last4,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
    isDefault: pm.id === defaultId
  };
}

// stripe.paymentMethods.list is paginated (100 per page by default); fetch
// every page rather than only the first, otherwise a customer with more
// than a page of cards silently loses access to the rest of them.
function listAllPaymentMethods(stripe, customerId, callback) {
  var all = [];

  function fetchPage(startingAfter) {
    var params = { customer: customerId, type: "card", limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;

    stripe.paymentMethods.list(params, function (err, page) {
      if (err) return callback(err);

      var data = page.data || [];
      all = all.concat(data);

      if (page.has_more && data.length)
        return fetchPage(data[data.length - 1].id);

      callback(null, all);
    });
  }

  fetchPage();
}

// Cards added before this feature existed were stored as legacy Card
// objects (attached via customer.sources) rather than modern PaymentMethods,
// and Stripe does not surface those in paymentMethods.list. We fetch all of
// a customer's legacy cards so they can still be viewed/managed/removed
// here; any card added or set as default from now on becomes a real
// PaymentMethod instead.
function fetchLegacyCards(stripe, customerId, defaultSourceId, callback) {
  stripe.customers.listCards(customerId, { limit: 100 }, function (
    err,
    cards
  ) {
    if (err && err.code === "resource_missing") return callback(null, []);
    if (err) return callback(err);

    var legacyCards = (cards.data || []).map(function (card) {
      return {
        id: card.id,
        brand: normalizeBrand(card.brand),
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        isDefault: card.id === defaultSourceId,
        isLegacy: true
      };
    });

    callback(null, legacyCards);
  });
}

// A subscription can pin its own default_payment_method, which takes
// priority over the customer-level invoice_settings default when Stripe
// decides what to charge. We need the live subscription (not our cached
// copy, which may be stale) to know that.
function fetchSubscriptionDefault(stripe, customerId, subscriptionId, callback) {
  if (!subscriptionId) return callback(null, null);

  stripe.customers.retrieveSubscription(customerId, subscriptionId, function (
    err,
    subscription
  ) {
    // Best-effort: if we can't read the subscription, fall back to the
    // customer-level default rather than failing the whole sync.
    if (err || !subscription) return callback(null, null);

    callback(null, subscription.default_payment_method || null);
  });
}

// Fetches the Stripe customer's payment methods and caches a display-ready
// summary (brand, last 4 digits, expiry, which one is the default) on the
// user record. Stripe remains the source of truth for the payment-methods
// page itself; this cache lets other parts of the app (e.g. billing emails)
// show card details without an extra live API call.
module.exports = function syncPaymentMethods(user, callback) {
  if (!user || !user.subscription || !user.subscription.customer)
    return callback(null, []);

  var stripe = getStripeClient();

  if (!stripe) return callback(new Error("Stripe secret is not configured"));

  var customerId = user.subscription.customer;

  stripe.customers.retrieve(customerId, function (err, customer) {
    if (err) return callback(err);

    var defaultSourceId = customer.default_source || null;

    fetchSubscriptionDefault(
      stripe,
      customerId,
      user.subscription.id,
      function (_, subscriptionDefaultId) {
        // A subscription-level default_payment_method, if set, is what
        // actually gets charged for this subscription and takes priority
        // over the customer's general invoice_settings default.
        var defaultId =
          subscriptionDefaultId ||
          (customer.invoice_settings &&
            customer.invoice_settings.default_payment_method) ||
          null;

        listAllPaymentMethods(stripe, customerId, function (err, methods) {
          if (err) return callback(err);

          var paymentMethods = methods
            .filter(function (pm) {
              return pm.card;
            })
            .map(function (pm) {
              return buildPaymentMethod(pm, defaultId);
            });

          // A legacy card is only "the default" when nothing set a modern
          // PaymentMethod as the default - Stripe prefers
          // default_payment_method over default_source when both exist.
          fetchLegacyCards(
            stripe,
            customerId,
            defaultId ? null : defaultSourceId,
            function (err, legacyCards) {
              if (err) return callback(err);

              paymentMethods = legacyCards.concat(paymentMethods);

              set(user.uid, { paymentMethods: paymentMethods }, function (
                err
              ) {
                if (err) return callback(err);

                callback(null, paymentMethods);
              });
            }
          );
        });
      }
    );
  });
};

module.exports.getClient = getStripeClient;

module.exports._setStripeClient = function (client) {
  stripeClient = client;
};

module.exports._resetStripeClient = function () {
  stripeClient = null;
};
