// Sets user.subscriptionOverdueSince for past_due/unpaid subscriptions that
// don't have it yet, using the creation time of the subscription's oldest open
// invoice (the renewal that first failed). Stripe rolls current_period_end
// forward on unpaid subscriptions, so it can't be used for this.
//
// Usage: node scripts/user/backfill-subscription-overdue-since.js [--write]
// Without --write it only reports what it would change.

const each = require("../each/user");
const config = require("config");
const User = require("models/user");
const stripe = require("stripe")(config.stripe.secret);

const WRITE = process.argv.includes("--write");
const counts = { updated: 0, skipped: 0, noInvoice: 0 };

async function oldestOpenInvoiceMs(subscriptionId) {
  let oldest = null;
  for await (const invoice of stripe.invoices.list({
    subscription: subscriptionId,
    status: "open",
    limit: 100,
  })) {
    if (oldest === null || invoice.created < oldest) oldest = invoice.created;
  }
  return oldest === null ? null : oldest * 1000;
}

each(
  function (user, next) {
    const subscription = user && user.subscription;
    const overdue =
      subscription &&
      (subscription.status === "past_due" || subscription.status === "unpaid");

    if (!overdue || user.subscriptionOverdueSince) {
      counts.skipped++;
      return next();
    }

    oldestOpenInvoiceMs(subscription.id)
      .then(function (since) {
        if (!since) {
          counts.noInvoice++;
          console.log("No open invoice found:", user.email, subscription.id);
          return next();
        }

        console.log(
          WRITE ? "Setting" : "Would set",
          user.email,
          new Date(since).toISOString()
        );

        if (!WRITE) {
          counts.updated++;
          return next();
        }

        User.set(user.uid, { subscriptionOverdueSince: since }, function (err) {
          if (!err) counts.updated++;
          next(err);
        });
      })
      .catch(next);
  },
  function (err) {
    if (err) throw err;
    console.log(counts);
    if (!WRITE) console.log("Dry run. Re-run with --write to apply.");
    process.exit();
  }
);
