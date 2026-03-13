/**
 * Removes dangling user IDs from the global uids set.
 *
 * A dangling user ID is present in the "uids" Redis set but does not have
 * a corresponding user hash at user:<uid>:info.
 *
 * Usage:
 *   node scripts/user/cleanup-dangling-users.js
 *   node scripts/user/cleanup-dangling-users.js --yes
 *   node scripts/user/cleanup-dangling-users.js -h
 */

var async = require("async");
var colors = require("colors/safe");
var User = require("models/user");
var key = require("models/user/key");
var client = require("models/client");
var getConfirmation = require("../util/getConfirmation");

var argv = process.argv.slice(2);
var YES_FLAG = argv.indexOf("-y") !== -1 || argv.indexOf("--yes") !== -1;
var HELP_FLAG = argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1;

if (HELP_FLAG) {
  printUsage();
  process.exit(0);
}

if (require.main === module)
  main(function (err) {
    if (err) throw err;
    process.exit();
  });

function printUsage() {
  console.log("Usage: node scripts/user/cleanup-dangling-users.js [--yes]");
  console.log("");
  console.log("Options:");
  console.log("  -y, --yes   remove dangling IDs without confirmation");
  console.log("  -h, --help  show this help output");
}

function main(callback) {
  User.getAllIds(function (err, uids) {
    if (err) return callback(err);

    uids = Array.isArray(uids) ? uids : [];

    if (!uids.length) {
      console.log("No IDs in user index set.");
      return callback();
    }

    var scanned = 0;
    var dangling = [];

    async.eachSeries(
      uids,
      function (uid, next) {
        scanned += 1;

        User.getById(uid, function (err, user) {
          if (err) return next(err);

          if (!user) dangling.push(uid);

          next();
        });
      },
      function (err) {
        if (err) return callback(err);

        console.log("\nScan complete");
        console.log("User IDs scanned:", scanned);
        console.log("Dangling user IDs:", dangling.length);

        if (!dangling.length) {
          console.log(colors.green("No dangling IDs found in user index set."));
          return callback();
        }

        console.log("\nDangling IDs found:");
        dangling.forEach(function (uid, i) {
          console.log(i + 1 + ".", uid);
        });

        function remove() {
          client.srem(key.uids, dangling, function (err, removedCount) {
            if (err) return callback(err);

            console.log(
              colors.green(
                "Removed " + (removedCount || 0) + " dangling ID(s) from user index set."
              )
            );

            callback();
          });
        }

        if (YES_FLAG) return remove();

        getConfirmation(
          "Remove these dangling IDs from the user index set?",
          function (err, ok) {
            if (err) return callback(err);

            if (!ok) {
              console.log(colors.yellow("No changes made."));
              return callback();
            }

            remove();
          }
        );
      }
    );
  });
}

module.exports = main;
