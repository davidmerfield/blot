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

// Cards added before this feature existed were stored as a legacy Card
// (attached via customer.default_source) rather than a modern PaymentMethod,
// and Stripe does not surface those in paymentMethods.list. We fetch the
// customer's default source directly so those cards still show up here; any
// card added or set as default from now on becomes a real PaymentMethod.
function fetchLegacyDefaultCard(stripe, customerId, defaultSourceId, callback) {
  if (!defaultSourceId || defaultSourceId.indexOf("card_") !== 0)
    return callback(null, null);

  stripe.customers.retrieveCard(customerId, defaultSourceId, function (
    err,
    card
  ) {
    if (err && err.code === "resource_missing") return callback(null, null);
    if (err) return callback(err);
    if (!card || card.object !== "card") return callback(null, null);

    return callback(null, {
      id: card.id,
      brand: normalizeBrand(card.brand),
      last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      isDefault: true,
      isLegacy: true
    });
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

    var defaultId =
      (customer.invoice_settings &&
        customer.invoice_settings.default_payment_method) ||
      null;
    var defaultSourceId = customer.default_source || null;

    stripe.paymentMethods.list({ customer: customerId, type: "card" }, function (
      err,
      methods
    ) {
      if (err) return callback(err);

      var paymentMethods = (methods.data || [])
        .filter(function (pm) {
          return pm.card;
        })
        .map(function (pm) {
          return buildPaymentMethod(pm, defaultId);
        });

      var alreadyHasDefault = paymentMethods.some(function (pm) {
        return pm.isDefault;
      });

      fetchLegacyDefaultCard(
        stripe,
        customerId,
        alreadyHasDefault ? null : defaultSourceId,
        function (err, legacyCard) {
          if (err) return callback(err);

          if (legacyCard) paymentMethods.unshift(legacyCard);

          set(user.uid, { paymentMethods: paymentMethods }, function (err) {
            if (err) return callback(err);

            callback(null, paymentMethods);
          });
        }
      );
    });
  });
};

module.exports.getClient = getStripeClient;

module.exports._setStripeClient = function (client) {
  stripeClient = client;
};

module.exports._resetStripeClient = function () {
  stripeClient = null;
};
