var User = require("models/user");
var async = require("async");
var dailyUpdate = require("./daily");
var email = require("helper/email");
var clfdate = require("helper/clfdate");
const scheduler = require("node-schedule");
var checkFeaturedSites = require("../documentation/featured/check");
var publishScheduledEntries = require("./publish-scheduled-entries");
const freeDiskSpace = require("./free-disk-space");
const exec = require("child_process").exec;
const zombies = require("./zombies");
const checkCardTesters = require("./check-card-testers");
const subscriptionLifecycleJob = require("./subscription-lifecycle");

// If any disk has less than 2GB of space, we should notify the admin
const MINIMUM_DISK_SPACE_IN_K = 2 * 1024 * 1024;

// If the data disk has less than 10GB of space, we should notify the admin
const DATA_DISK_MINIMUM_DISK_SPACE_IN_K = 10 * 1024 * 1024;

let NOTIFIED_LOW_DISK_SPACE = false;

module.exports = function () {
  // Check for zombie processes and low disk space once per minute.
  scheduler.scheduleJob("* * * * *", function () {
    // Detect any zombie processes
    zombies(function (err) {
      if (err) throw err;
    });

    freeDiskSpace(function (err, disks) {
      let shouldNotify = false;

      if (err || !disks) {
        console.error(clfdate(), "Error checking disk space", err);
        return;
      }

      if (disks.some(disk => disk.available_k < MINIMUM_DISK_SPACE_IN_K)) {
        shouldNotify = true;
      }

      if (
        disks.find(disk => disk.label === "data") &&
        disks.find(disk => disk.label === "data").available_k <
          DATA_DISK_MINIMUM_DISK_SPACE_IN_K
      ) {
        shouldNotify = true;
      }

      if (shouldNotify && !NOTIFIED_LOW_DISK_SPACE) {
        NOTIFIED_LOW_DISK_SPACE = true;
        email.WARNING_LOW_DISK_SPACE(null, { disks }, function (err) {
          if (err) console.error(clfdate(), err);
        });
      }
    });

  });

  // Bash the cache for scheduled posts
  publishScheduledEntries(function (err) {
    if (err) throw err;
    console.log(clfdate(), "Scheduled entries for future publication");
  });

  // Warn users about impending subscriptions
  User.getAllIds(function (err, uids) {
    if (err) {
      console.error("Error fetching user ids for scheduling:", err);
      return;
    }

    async.each(uids, User.scheduleSubscriptionEmail, function (err) {
      if (err) {
        console.error("Error scheduling subscription emails:", err);
      } else {
        console.log(clfdate(), "Scheduled emails for renewals and expiries!");
      }
    });

    async.each(
      uids,
      function (uid, next) {
        User.scheduleWelcomeEmail(uid, function (err) {
          if (err) console.error("Error scheduling welcome email for", uid, err);
          next();
        });
      },
      function (err) {
        if (err) {
          console.error("Error scheduling welcome emails:", err);
        } else {
          console.log(clfdate(), "Scheduled welcome emails where needed!");
        }
      }
    );
  });

  console.log(clfdate(), "Scheduled daily check of storage disk usage");
  scheduler.scheduleJob({ hour: 10, minute: 0 }, function () {
    exec("df -h", function (err, stdout) {
      if (err) throw err;

      var disk = stdout.split("\n")[1].replace(/\s+/g, " ").split(" ");
      var usage = disk[4];
      var available = disk[3];

      if (parseInt(usage) >= 90) {
        console.warn(
          clfdate(),
          "Scheduler: Disk usage is high. Usage:",
          usage,
          "Space available:",
          available
        );
      }
    });
  });

  // console.log(
  //   clfdate(),
  //   "Scheduled daily check of folders for sync abnormalities"
  // );
  // scheduler.scheduleJob({ hour: 8, minute: 0 }, function () {
  //   console.log(clfdate(), "Fix sync: checking folders");
  //   fix(function (err, report) {
  //     if (err) {
  //       console.log(clfdate(), "Fix sync: error checking folders", err);
  //     } else {
  //       email.SYNC_REPORT(null, { report: JSON.stringify(report) });
  //       console.log(clfdate(), "Fix sync: checked all folders");
  //     }
  //   });
  // });



  console.log(clfdate(), "Scheduled daily subscription lifecycle processing");
  scheduler.scheduleJob({ hour: 9, minute: 0 }, function () {
    console.log(clfdate(), "Processing subscription lifecycle changes");
    subscriptionLifecycleJob(function (err) {
      if (err) console.error(clfdate(), "Error processing subscription lifecycle", err);
    });
  });

  console.log(clfdate(), "Scheduled daily check of suspected fraudulent users");
  scheduler.scheduleJob({ hour: 11, minute: 0 }, async function () {
    console.log(clfdate(), "Checking for potential fraudulent users");

    let customers;
    
    try {
      customers = await checkCardTesters();
    } catch (err) {
      console.error(clfdate(), "Error: Checking suspected fraudulent users", err);
    }

    if (!customers || customers.length === 0) {
      console.log(clfdate(), "No suspected fraudulent users found");
    } else {
      email.SUSPECTED_FRAUD(null, { customers });
    }
  });

  console.log(clfdate(), "Scheduled daily check of featured sites");
  scheduler.scheduleJob({ hour: 8, minute: 0 }, function () {
    console.log(clfdate(), "Checking featured sites");
    checkFeaturedSites(function (err) {
      if (err) {
        console.error(clfdate(), "Error: Checking featured sites", err);
      } else {
        console.log(clfdate(), "Checked featured sites");
      }
    });
  });

  // At some point I should check this doesnt consume too much memory
  console.log(clfdate(), "Scheduled daily update email");
  scheduler.scheduleJob({ hour: 12, minute: 0 }, function () {
    console.log(clfdate(), "Generating daily update email...");
    dailyUpdate(function () {
      console.log(clfdate(), "Daily update email update was sent.");
    });
  });
};
