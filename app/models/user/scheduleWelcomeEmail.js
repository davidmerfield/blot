const ensure = require("helper/ensure");
const debug = require("debug")("blot:user:scheduleWelcomeEmail");
const scheduler = require("node-schedule");

const email = require("helper/email");
const getById = require("./getById");
const set = require("./set");

const scheduledWelcomeEmails = new Map();
const WELCOME_EMAIL_DELAY_MS = 5 * 60 * 1000; // 5 minutes

function getCreatedDate(user) {
  if (!user) return new Date();

  if (typeof user.created === "number") {
    return new Date(user.created);
  }

  if (typeof user.created === "string") {
    const parsed = Date.parse(user.created);

    if (!Number.isNaN(parsed)) return new Date(parsed);
  }

  return new Date();
}

function sendWelcomeEmail(uid, callback) {
  getById(uid, function (err, user) {
    if (err) return callback(err);

    if (!user) return callback(new Error("No user"));

    if (user.welcomeEmailSent) return callback();

    email.WELCOME(uid, {}, function (err) {
      if (err) {
        debug(uid, "Failed to send welcome email", err);
        return callback(err);
      }

      set(uid, { welcomeEmailSent: true }, function (err) {
        if (err) {
          debug(uid, "Failed to persist welcome email flag", err);
          return callback(err);
        }

        debug(uid, "Welcome email sent and recorded");
        callback();
      });
    });
  });
}

module.exports = function scheduleWelcomeEmail(uid, callback = function () {}) {
  try {
    ensure(uid, "string").and(callback, "function");
  } catch (err) {
    return callback(err);
  }

  getById(uid, function (err, user) {
    if (err) return callback(err);

    if (!user) return callback(new Error("No user"));

    const existing = scheduledWelcomeEmails.get(uid);

    if (user.welcomeEmailSent) {
      if (existing) {
        existing.cancel();
        scheduledWelcomeEmails.delete(uid);
      }

      debug(uid, "Welcome email already sent, skipping schedule");
      return callback();
    }

    const createdAt = getCreatedDate(user);
    const scheduledTime = new Date(
      createdAt.getTime() + WELCOME_EMAIL_DELAY_MS
    );

    if (existing) {
      existing.cancel();
      scheduledWelcomeEmails.delete(uid);
    }

    if (scheduledTime.getTime() <= Date.now()) {
      debug(uid, "Scheduled time already passed, sending immediately");

      return sendWelcomeEmail(uid, callback);
    }

    const job = scheduler.scheduleJob(scheduledTime, function () {
      debug(uid, "Running scheduled welcome email job");

      sendWelcomeEmail(uid, function (err) {
        if (err) {
          debug(uid, "Error sending scheduled welcome email", err);
        }
      });
    });

    if (!job) {
      return callback(new Error("Unable to schedule welcome email"));
    }

    scheduledWelcomeEmails.set(uid, job);

    job.on("run", function () {
      scheduledWelcomeEmails.delete(uid);
    });

    job.on("canceled", function () {
      scheduledWelcomeEmails.delete(uid);
    });

    debug(uid, "Scheduled welcome email for", scheduledTime);

    callback();
  });
};

