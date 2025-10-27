var Express = require("express");
var Delete = new Express.Router();
var User = require("models/user");
var Email = require("helper/email");
var checkPassword = require("./util/checkPassword");
var logout = require("./util/logout");
var async = require("async");

var Blog = require("models/blog");
var config = require("config");
var prettyPrice = require("helper/prettyPrice");

var Stripe = require("stripe");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let stripeClient = null;

function getStripeClient() {
  if (!stripeClient) {
    stripeClient = Stripe(config.stripe.secret);
  }

  return stripeClient;
}

Delete.route("/")

  .get(function (req, res) {
    res.render("dashboard/account/delete", {
      title: "Delete your account",
      breadcrumb: "Delete",
    });
  })

  .post(
    checkPassword,
    issueDeletionRefund,
    deleteSubscription,
    deleteBlogs,
    deleteUser,
    emailUser,
    logout,
    function (req, res) {
      res.redirect("/sites/deleted");
    }
  );

function emailUser(req, res, next) {
  if (req.refund?.issued) {
    return Email.ACCOUNT_DELETION_REFUND(
      "",
      Object.assign({}, req.user, { refund: req.refund }),
      next
    );
  }

  Email.DELETED("", req.user, next);
}
function deleteBlogs(req, res, next) {
  async.each(req.user.blogs, Blog.remove, next);
}

function deleteUser(req, res, next) {
  User.remove(req.user.uid, next);
}

async function deleteSubscription(req, res, next) {
  try {
    await ensureIssueDeletionRefund(req);

    if (req.user.paypal?.status) {
      const response = await fetch(
        `${config.paypal.api_base}/v1/billing/subscriptions/${req.user.paypal.id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: buildPaypalAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "Customer deleted account",
          }),
        }
      );

      if (response.status !== 204) {
        throw await paypalError(response, "PayPal API error");
      }

      console.log("PayPal subscription canceled");
    } else if (req.user.subscription?.customer) {
      const client = getStripeClient();

      if (!client?.customers?.del) {
        throw new Error("Stripe client unavailable");
      }

      const deleted = await client.customers.del(
        req.user.subscription.customer
      );

      if (!deleted || deleted.deleted !== true) {
        throw new Error("Stripe customer not deleted");
      }

      console.log("Stripe customer deleted");
    }

    next();
  } catch (error) {
    console.error("Error in deleting subscription:", error);
    next(error);
  }
}

async function issueDeletionRefund(req, res, next) {
  try {
    await ensureIssueDeletionRefund(req);
  } catch (error) {
    console.error("Error issuing deletion refund:", error);
    recordRefundError(req, undefined, error);
  }

  next();
}

async function ensureIssueDeletionRefund(req) {
  if (!req?.user) return;

  if (req.issueDeletionRefundHandled) return;

  req.issueDeletionRefundHandled = true;

  try {
    const now = Date.now();

    const stripeCreatedMs = toMs(req.user.subscription?.created);
    const paypalStartMs = toMs(req.user.paypal?.start_time);

    const stripeEligible = Boolean(
      req.user.subscription?.customer &&
        stripeCreatedMs &&
        now - stripeCreatedMs <= THIRTY_DAYS_MS
    );

    const paypalEligible = Boolean(
      req.user.paypal?.id &&
        paypalStartMs &&
        now - paypalStartMs <= THIRTY_DAYS_MS
    );

    if (!stripeEligible && !paypalEligible) return;

    if (stripeEligible) {
      try {
        const issued = await issueStripeRefund(req, now);
        if (issued) return;
      } catch (error) {
        if (isStripeAlreadyRefunded(error)) {
          console.warn("Stripe charge already refunded:", error.message || error);
          recordRefundError(req, "stripe", error, { alreadyRefunded: true });
        } else {
          console.error("Stripe refund failed:", error);
          recordRefundError(req, "stripe", error);
        }
      }
    }

    if (paypalEligible) {
      try {
        await issuePaypalRefund(req, now, paypalStartMs);
      } catch (error) {
        if (isPaypalAlreadyRefunded(error)) {
          console.warn("PayPal capture already refunded:", error.message || error);
          recordRefundError(req, "paypal", error, { alreadyRefunded: true });
        } else {
          console.error("PayPal refund failed:", error);
          recordRefundError(req, "paypal", error);
        }
      }
    }
  } catch (error) {
    console.error("Unexpected refund error:", error);
    recordRefundError(req, undefined, error);
  }
}

async function issueStripeRefund(req, now) {
  const client = getStripeClient();

  if (!client?.invoices?.list || !client?.refunds?.create) {
    throw new Error("Stripe client unavailable");
  }

  const invoicesResponse = await client.invoices.list({
    customer: req.user.subscription.customer,
    limit: 100,
  });

  const eligibleInvoices = (invoicesResponse?.data || [])
    .filter((invoice) => invoice && invoice.paid && invoice.charge)
    .map((invoice) => ({ invoice, createdMs: toMs(invoice.created) }))
    .filter(
      ({ createdMs }) =>
        typeof createdMs === "number" && now - createdMs <= THIRTY_DAYS_MS
    );

  if (!eligibleInvoices.length) return false;

  const { invoice: targetInvoice, createdMs: invoiceCreatedMs } =
    eligibleInvoices.reduce((latest, current) => {
      if (!latest) return current;

      return current.createdMs >= latest.createdMs ? current : latest;
    }, null);

  if (!invoiceCreatedMs) return false;

  const refund = await client.refunds.create({
    charge: targetInvoice.charge,
    reason: "requested_by_customer",
  });

  if (!refund) return false;

  const currency = refund.currency
    ? refund.currency.toUpperCase()
    : undefined;
  const amount = refund.amount;

  req.refund = {
    issued: true,
    provider: "stripe",
    providerPretty: "Stripe",
    id: refund.id,
    invoice: targetInvoice.id,
    charge: targetInvoice.charge,
    amount,
    currency,
    amountPretty: formatAmount(amount, currency),
  };

  return true;
}

async function issuePaypalRefund(req, now, startMs) {
  if (!config.paypal?.client_id || !config.paypal?.secret) {
    throw new Error("PayPal credentials unavailable");
  }

  const authHeader = buildPaypalAuthHeader();
  const startTime = new Date(startMs).toISOString();
  const endTime = new Date(now).toISOString();
  const transactionsUrl =
    `${config.paypal.api_base}/v1/billing/subscriptions/${req.user.paypal.id}/transactions` +
    `?start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`;

  const transactionsResponse = await fetch(transactionsUrl, {
    headers: { Authorization: authHeader },
  });

  if (!transactionsResponse.ok) {
    throw await paypalError(transactionsResponse, "PayPal API error");
  }

  const transactions = await transactionsResponse.json();
  const capture = selectMostRecentCapture(transactions?.transactions || []);

  if (!capture) return false;

  const captureId =
    capture.capture_id || capture.id || capture.transaction_id || capture.resource_id;

  if (!captureId) return false;

  const refundResponse = await fetch(
    `${config.paypal.api_base}/v2/payments/captures/${captureId}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!refundResponse.ok) {
    const errorPayload = await readPaypalErrorBody(refundResponse);

    if (
      isPaypalAlreadyRefundedResponse(
        errorPayload?.body,
        errorPayload?.text
      )
    ) {
      const message =
        paypalAlreadyRefundedMessage(errorPayload?.body, errorPayload?.text) ||
        "PayPal refund already processed";
      const error = new Error(message);
      error.code = "PAYPAL_ALREADY_REFUNDED";
      error.alreadyRefunded = true;
      throw error;
    }

    throw await paypalError(
      refundResponse,
      "PayPal refund error",
      errorPayload?.body,
      errorPayload?.text
    );
  }

  const refund = await refundResponse.json();

  const amountInfo =
    refund.amount ||
    refund.seller_payable_breakdown?.gross_amount ||
    refund.seller_payable_breakdown?.net_amount ||
    capture.amount_with_breakdown?.gross_amount ||
    capture.amount;

  const rawCurrency =
    amountInfo?.currency_code ||
    amountInfo?.currency ||
    req.user.paypal?.currency;
  const currency = rawCurrency ? rawCurrency.toUpperCase() : undefined;
  const amountValue =
    amountInfo?.value ?? amountInfo?.total ?? amountInfo?.amount ?? amountInfo?.gross;

  const amountCents = toCents(amountValue);

  req.refund = {
    issued: true,
    provider: "paypal",
    providerPretty: "PayPal",
    id: refund.id,
    capture: captureId,
    amount: amountCents ?? amountValue,
    currency,
    amountPretty:
      formatAmount(amountCents, currency) ||
      (amountValue && currency ? `${amountValue} ${currency}` : undefined),
  };

  return true;
}

function selectMostRecentCapture(transactions) {
  return transactions
    .filter((transaction) => {
      if (!transaction) return false;

      const status = transaction.status || transaction.transaction_status;
      return typeof status === "string" && status.toUpperCase() === "COMPLETED";
    })
    .reduce((latest, transaction) => {
      const transactionTime = toMs(transaction.time || transaction.transaction_time);
      const latestTime = toMs(latest?.time || latest?.transaction_time) || 0;

      if (!latest) return transaction;

      return (transactionTime || 0) >= latestTime ? transaction : latest;
    }, null);
}

function formatAmount(amount, currency) {
  const upperCurrency = currency ? currency.toUpperCase() : currency;

  if (typeof amount === "number" && Number.isFinite(amount)) {
    if (!upperCurrency || upperCurrency === "USD") {
      return prettyPrice(amount);
    }

    const value = (amount / 100).toFixed(2);
    return `${value} ${upperCurrency}`.trim();
  }

  if (typeof amount === "string" && amount !== "") {
    const numeric = Number(amount);

    if (Number.isFinite(numeric)) {
      return formatAmount(Math.round(numeric * 100), upperCurrency);
    }

    return upperCurrency ? `${amount} ${upperCurrency}` : amount;
  }

  return undefined;
}

function toMs(timestamp) {
  if (!timestamp) return null;

  if (timestamp instanceof Date) return timestamp.getTime();

  if (typeof timestamp === "number") {
    if (!Number.isFinite(timestamp)) return null;

    return timestamp < 1e12 ? timestamp * 1000 : timestamp;
  }

  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);

    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function toCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === "string" && value !== "") {
    const numeric = Number(value);

    return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
  }

  return null;
}

function buildPaypalAuthHeader() {
  return `Basic ${Buffer.from(
    `${config.paypal.client_id}:${config.paypal.secret}`
  ).toString("base64")}`;
}

async function paypalError(response, prefix, bodyOverride, textOverride) {
  let message = `${prefix}: ${response.status}`;
  let body = bodyOverride;
  let text = textOverride;

  if (!body) {
    try {
      body = await response.json();
    } catch (_) {}
  }

  if (!text && body) {
    try {
      text = JSON.stringify(body);
    } catch (_) {}
  }

  if (!text) {
    try {
      text = await response.text();
    } catch (_) {}
  }

  if (body?.message) {
    message = `${prefix}: ${body.message}`;
  } else if (body?.name || body?.details) {
    message = `${prefix}: ${body.name || ""} ${
      Array.isArray(body?.details)
        ? body.details
            .map((detail) => detail.issue || detail.description)
            .filter(Boolean)
            .join(", ")
        : ""
    }`.trim();
  } else if (text) {
    message = `${prefix}: ${text}`;
  }

  const error = new Error(message);

  if (body?.name && !error.code) {
    error.code = body.name;
  }

  if (Array.isArray(body?.details) && !error.details) {
    error.details = body.details;
  }

  return error;
}

function getProviderPretty(provider) {
  if (provider === "stripe") return "Stripe";
  if (provider === "paypal") return "PayPal";
  return provider;
}

function recordRefundError(req, provider, error, extra) {
  if (!req) return;

  if (req.refund?.issued) return;

  const message = normalizeErrorMessage(error);
  const base = req.refund && !req.refund.issued ? req.refund : {};
  const updates = Object.assign({ issued: false, skipped: true }, extra || {});

  if (message && updates.error === undefined) {
    updates.error = message;
  }

  if (provider && !updates.provider) {
    updates.provider = provider;
  }

  if (provider && !updates.providerPretty) {
    updates.providerPretty = getProviderPretty(provider);
  }

  req.refund = Object.assign({}, base, updates);
}

function normalizeErrorMessage(error) {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (error && typeof error.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function isStripeAlreadyRefunded(error) {
  const code = error?.code || error?.raw?.code;
  if (typeof code === "string" && code.toLowerCase() === "charge_already_refunded") {
    return true;
  }

  const message = normalizeErrorMessage(error);
  return typeof message === "string"
    ? message.toLowerCase().includes("already refunded")
    : false;
}

function isPaypalAlreadyRefunded(error) {
  if (!error) return false;

  if (error.alreadyRefunded) return true;

  if (typeof error.code === "string") {
    const code = error.code.toLowerCase();
    if (code.includes("refund") && code.includes("already")) return true;
  }

  if (Array.isArray(error.details)) {
    const match = error.details.some((detail) =>
      typeof detail?.issue === "string"
        ? detail.issue.toLowerCase().includes("refund") &&
          detail.issue.toLowerCase().includes("already")
        : false
    );
    if (match) return true;
  }

  const message = normalizeErrorMessage(error);
  return typeof message === "string"
    ? message.toLowerCase().includes("refund") &&
        message.toLowerCase().includes("already")
    : false;
}

async function readPaypalErrorBody(response) {
  if (!response) return {};

  let body;
  let text;

  try {
    body = await response.json();
  } catch (_) {
    body = undefined;
  }

  if (body !== undefined) {
    try {
      text = JSON.stringify(body);
    } catch (_) {
      text = undefined;
    }
  }

  if (!text) {
    try {
      text = await response.text();
    } catch (_) {
      text = undefined;
    }
  }

  return { body, text };
}

function isPaypalAlreadyRefundedResponse(body, text) {
  if (Array.isArray(body?.details)) {
    const match = body.details.some((detail) => {
      const issue = detail?.issue || detail?.description;
      return typeof issue === "string"
        ? issue.toLowerCase().includes("refund") &&
            issue.toLowerCase().includes("already")
        : false;
    });
    if (match) return true;
  }

  if (typeof body?.message === "string") {
    const message = body.message.toLowerCase();
    if (message.includes("refund") && message.includes("already")) return true;
  }

  if (typeof text === "string") {
    const lower = text.toLowerCase();
    if (lower.includes("refund") && lower.includes("already")) return true;
  }

  return false;
}

function paypalAlreadyRefundedMessage(body, text) {
  if (Array.isArray(body?.details)) {
    const detail = body.details.find((item) => {
      const issue = item?.issue || item?.description;
      return typeof issue === "string"
        ? issue.toLowerCase().includes("refund") &&
            issue.toLowerCase().includes("already")
        : false;
    });

    if (detail?.description) return detail.description;
    if (detail?.issue) return detail.issue;
  }

  if (typeof body?.message === "string") {
    return body.message;
  }

  if (typeof text === "string") {
    return text;
  }

  return undefined;
}

// We expose these methods for our scripts
// Hopefully this does not clobber anything in
// the exposed Express application?

if (Delete.exports !== undefined)
  throw new Error(
    "Delete.exports is defined (typeof=" +
      typeof Delete.exports +
      ") Would clobber Delete.exports"
  );

Delete.exports = {
  blogs: deleteBlogs,
  user: deleteUser,
  subscription: deleteSubscription,
  refund: issueDeletionRefund,
  email: emailUser,
  ensureRefund: ensureIssueDeletionRefund,
};

Delete._setStripeClient = function (client) {
  stripeClient = client;
};

Delete._resetStripeClient = function () {
  stripeClient = null;
};

module.exports = Delete;
