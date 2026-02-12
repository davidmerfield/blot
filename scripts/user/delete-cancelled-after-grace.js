var async = require("async");
var colors = require("colors/safe");
var moment = require("moment");
var eachUser = require("../each/user");
var getConfirmation = require("../util/getConfirmation");
var subscriptionLifecycle = require("models/user/subscriptionLifecycle");
var Delete = require("dashboard/account/delete");
var Blog = require("models/blog");

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

console.log("Scanning for cancelled users that passed the 1 month grace period...");

var found = 0;
var deleted = 0;

eachUser(
  function (user, next) {
    var details = subscriptionLifecycle.cancellationDetails(user);

    if (!details.cancelled || !details.periodEnded) return next();
    if (!subscriptionLifecycle.deletionDue(user)) return next();

    found += 1;

    async.map(
      user.blogs || [],
      function (blogID, done) {
        Blog.get({ id: blogID }, done);
      },
      function (err, blogs) {
        if (err) return next(err);

        getConfirmation(describeUser(user, blogs.filter(Boolean), details), function (_, yes) {
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
