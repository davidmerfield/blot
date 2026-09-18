// Disk-space inventory of disabled / unpaid accounts.
//
// This is NOT the same set as scripts/user/delete-users-to-remove.js.
// That script (and the daily subscription lifecycle job) only removes
// accounts that have passed the lifecycle grace period:
//   - cancelled, period ended, then 1 month
//   - Stripe past_due/unpaid, period ended, then 2 months
//
// This script still lists every disabled user and every Stripe `unpaid`
// user so we can see how much disk they use, then prints why each one
// is or is not due for deletion.

const each = require("../each/user");
const child_process = require("child_process");
const { blog_static_files_dir, blog_folder_dir } = require("config");
const prettySize = require("helper/prettySize");
const fs = require("fs");
const subscriptionLifecycle = require("models/user/subscriptionLifecycle");

let rolling_total = 0;
let due_total = 0;
const listed = [];
const skipCounts = {};
const dueCounts = {};

function addCount(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function diskUsageKb(blogID) {
  try {
    const static_space_used = fs.existsSync(`${blog_static_files_dir}/${blogID}`)
      ? child_process
          .execSync(`du -sb ${blog_static_files_dir}/${blogID}`)
          .toString()
      : "0\t0";

    const folder_space_used = fs.existsSync(`${blog_folder_dir}/${blogID}`)
      ? child_process.execSync(`du -sb ${blog_folder_dir}/${blogID}`).toString()
      : "0\t0";

    const static_space_used_in_bytes = parseInt(
      static_space_used.trim().split("\t")[0]
    );
    const folder_space_used_in_bytes = parseInt(
      folder_space_used.trim().split("\t")[0]
    );

    return (static_space_used_in_bytes + folder_space_used_in_bytes) / 1000;
  } catch (e) {
    console.log("error", e);
    return 0;
  }
}

function isoOrNone(ms) {
  return ms ? new Date(ms).toISOString() : "none";
}

function classify(user, removal) {
  const status = (user.subscription && user.subscription.status) || "none";
  const paypal = (user.paypal && user.paypal.status) || "none";
  const stripePeriodEnd = subscriptionLifecycle.stripePeriodEndAtMs(
    user.subscription
  );
  const paypalPeriodEnd = subscriptionLifecycle.paypalPeriodEndAtMs(
    user.paypal
  );
  const dueOrSkip = removal.due
    ? "due=" + removal.reason
    : "skip=" + removal.skipReason;

  return [
    dueOrSkip,
    "disabled=" + Boolean(user.isDisabled),
    "stripe=" + status,
    "paypal=" + paypal,
    "stripe_period_end=" + isoOrNone(stripePeriodEnd),
    "paypal_period_end=" + isoOrNone(paypalPeriodEnd),
  ].join(" ");
}

console.log(
  "Listing disabled or Stripe unpaid accounts, and classifying them against the deletion lifecycle."
);
console.log(
  "delete-users-to-remove.js only deletes accounts with due=cancelled or due=overdue."
);

each(
  function (user, next) {
    if (!user) {
      console.log("No user found, exiting.");
      return next();
    }

    const removal = subscriptionLifecycle.removalDetails(user);
    const unpaid = user.subscription && user.subscription.status === "unpaid";

    if (!user.isDisabled && !unpaid) return next();

    let user_total = 0;
    for (const blogID of user.blogs || []) {
      user_total += diskUsageKb(blogID);
    }

    rolling_total += user_total;
    listed.push(user.email);

    if (removal.due) {
      due_total += user_total;
      addCount(dueCounts, removal.reason);
    } else {
      addCount(skipCounts, removal.skipReason);
    }

    console.log(
      prettySize(user_total),
      user.email,
      (user.blogs || []).join(",") || "(no blogs)",
      classify(user, removal)
    );

    next();
  },
  function (err) {
    if (err) throw err;

    console.log("Done!");
    console.log("");
    console.log(
      "Listed",
      listed.length,
      "disabled or Stripe unpaid accounts (old heuristic)."
    );
    console.log(
      "Of those,",
      Object.keys(dueCounts).reduce(function (sum, key) {
        return sum + dueCounts[key];
      }, 0),
      "are due for deletion under the subscription lifecycle:"
    );

    Object.keys(dueCounts)
      .sort()
      .forEach(function (reason) {
        console.log("  due=" + reason + ":", dueCounts[reason]);
      });

    if (!Object.keys(dueCounts).length) {
      console.log("  (none)");
    }

    console.log("Not due yet, or not a lifecycle candidate:");
    Object.keys(skipCounts)
      .sort()
      .forEach(function (reason) {
        console.log("  skip=" + reason + ":", skipCounts[reason]);
      });

    if (!Object.keys(skipCounts).length) {
      console.log("  (none)");
    }

    console.log("");
    console.log(
      "Total space used by listed accounts:",
      prettySize(rolling_total)
    );
    console.log(
      "Space used by accounts due for deletion:",
      prettySize(due_total)
    );
    process.exit();
  }
);
