var async = require("async");
var colors = require("colors/safe");
var moment = require("moment");
var eachUser = require("../each/user");
var getConfirmation = require("../util/getConfirmation");
var subscriptionLifecycle = require("models/user/subscriptionLifecycle");
var Delete = require("dashboard/account/delete");
var Blog = require("models/blog");

var argv = process.argv.slice(2);
var FAST_MODE = argv.indexOf("-fast") !== -1 || argv.indexOf("--fast") !== -1;
var HELP_FLAG = argv.indexOf("-h") !== -1 || argv.indexOf("--help") !== -1;
var FAST_CONFIRMATION_PROMPT = "Delete all <count> users? (y/n)";

function printUsage() {
  console.log("Usage: node scripts/user/delete-cancelled-after-grace.js [-fast]");
  console.log("");
  console.log("Options:");
  console.log("  -fast, --fast  list all candidates first and confirm once before deleting");
  console.log("  -h, --help     show this help output");
}

if (HELP_FLAG) {
  printUsage();
  process.exit(0);
}

function describeUser(user, blogs, details) {
  var lines = [];

  lines.push(
    "Delete cancelled account " +
      colors.yellow(user.email) +
      " " +
      colors.dim(user.uid) +
      "?"
  );

  lines.push("- provider: " + details.provider);

  if (details.periodEndedAt) {
    lines.push(
      "- subscription period ended " +
        colors.underline(moment(details.periodEndedAt).fromNow()) +
        " (" +
        new Date(details.periodEndedAt).toISOString() +
        ")"
    );
  }

  blogs.forEach(function (blog) {
    if (!blog) return;
    lines.push(
      "- blog: " +
        colors.yellow(blog.title) +
        " " +
        colors.dim(blog.id) +
        " " +
        (blog.domain || blog.handle)
    );
  });

  return lines.join("\n");
}

function describeCandidateSummary(user, details) {
  var fields = [colors.yellow(user.email), colors.dim(user.uid), "provider=" + details.provider];

  if (details.periodEndedAt) {
    fields.push("periodEndedAt=" + new Date(details.periodEndedAt).toISOString());
  }

  return fields.join(" | ");
}

function deleteAccount(user, callback) {
  var req = { user: user };
  var res = {};

  async.applyEachSeries(
    [Delete.exports.subscription, Delete.exports.blogs, Delete.exports.user],
    req,
    res,
    callback
  );
}

function collectCandidates(done) {
  var candidates = [];

  eachUser(
    function (user, next) {
      var details = subscriptionLifecycle.cancellationDetails(user);

      if (!details.cancelled || !details.periodEnded) return next();
      if (!subscriptionLifecycle.deletionDue(user)) return next();

      async.map(
        user.blogs || [],
        function (blogID, blogDone) {
          Blog.get({ id: blogID }, blogDone);
        },
        function (err, blogs) {
          if (err) return next(err);

          candidates.push({
            user: user,
            details: details,
            blogs: blogs.filter(Boolean),
          });

          next();
        }
      );
    },
    function (err) {
      done(err, candidates);
    }
  );
}

function runFastMode(candidates, done) {
  if (!candidates.length) return done(null, 0);

  candidates.forEach(function (candidate, index) {
    console.log((index + 1) + ". " + describeCandidateSummary(candidate.user, candidate.details));
  });

  var prompt = FAST_CONFIRMATION_PROMPT.replace("<count>", candidates.length);

  getConfirmation(prompt, function (_, yes) {
    if (!yes) {
      console.log(colors.red("Deletion cancelled."));
      return done(null, 0);
    }

    var deleted = 0;

    async.eachSeries(candidates, function (candidate, next) {
      deleteAccount(candidate.user, function (deleteErr) {
        if (deleteErr) return next(deleteErr);
        deleted += 1;
        console.log(colors.green("Deleted " + candidate.user.email));
        next();
      });
    }, function (err) {
      done(err, deleted);
    });
  });
}

function runInteractiveMode(candidates, done) {
  var deleted = 0;

  async.eachSeries(
    candidates,
    function (candidate, next) {
      getConfirmation(
        describeUser(candidate.user, candidate.blogs, candidate.details),
        function (_, yes) {
          if (!yes) {
            console.log(colors.red("Skipped " + candidate.user.email));
            return next();
          }

          deleteAccount(candidate.user, function (deleteErr) {
            if (deleteErr) return next(deleteErr);
            deleted += 1;
            console.log(colors.green("Deleted " + candidate.user.email));
            next();
          });
        }
      );
    },
    function (err) {
      done(err, deleted);
    }
  );
}

console.log("Scanning for cancelled users that passed the 1 month grace period...");
if (!FAST_MODE) {
  console.log("Tip: use -fast to review all candidates and confirm once.");
}

collectCandidates(function (err, candidates) {
  if (err) throw err;

  var runMode = FAST_MODE ? runFastMode : runInteractiveMode;

  runMode(candidates, function (runErr, deleted) {
    if (runErr) throw runErr;
    console.log("Done. Candidates:", candidates.length, "Deleted:", deleted);
    process.exit();
  });
});
