var async = require("async");
var colors = require("colors/safe");
var moment = require("moment");
var eachUser = require("../each/user");
var getConfirmation = require("../util/getConfirmation");
var subscriptionLifecycle = require("models/user/subscriptionLifecycle");
var Delete = require("dashboard/account/delete");
var Blog = require("models/blog");

function describeUser(user, blogs, overdue) {
  var lines = [];

  lines.push(
    "Delete overdue account " +
      colors.yellow(user.email) +
      " " +
      colors.dim(user.uid) +
      "?"
  );

  lines.push("- overdue phase: " + overdue.phase);

  if (overdue.startedAt) {
    lines.push(
      "- overdue started " +
        colors.underline(moment(overdue.startedAt).fromNow()) +
        " (" +
        new Date(overdue.startedAt).toISOString() +
        ")"
    );
  }

  lines.push("- subscription status: " + ((user.subscription && user.subscription.status) || "unknown"));

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

console.log("Scanning for overdue users that passed the 2 month grace period...");

var found = 0;
var deleted = 0;

eachUser(
  function (user, next) {
    var overdue = subscriptionLifecycle.overdueDetails(user);

    if (!overdue.overdue || overdue.phase !== "deletion_flow") return next();

    found += 1;

    async.map(
      user.blogs || [],
      function (blogID, done) {
        Blog.get({ id: blogID }, done);
      },
      function (err, blogs) {
        if (err) return next(err);

        getConfirmation(describeUser(user, blogs.filter(Boolean), overdue), function (_, yes) {
          if (!yes) {
            console.log(colors.red("Skipped " + user.email));
            return next();
          }

          deleteAccount(user, function (deleteErr) {
            if (deleteErr) return next(deleteErr);
            deleted += 1;
            console.log(colors.green("Deleted " + user.email));
            next();
          });
        });
      }
    );
  },
  function (err) {
    if (err) throw err;
    console.log("Done. Candidates:", found, "Deleted:", deleted);
    process.exit();
  }
);
