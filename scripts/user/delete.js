var config = require("config");
var Delete = require("dashboard/account/delete");
var get = require("../get/user");
var getConfirmation = require("../util/getConfirmation");
var colors = require("colors");
var async = require("async");
var Blog = require("models/blog");
var each = require("../each/user");
var moment = require("moment");

if (!process.argv[2]) {
  console.log("Searching for disabled users to delete");
  each(
    function (user, next) {
      if (!user.isDisabled) return next();

      main(user, next);
    },
    function (err) {
      if (err) throw err;
      console.log("Search complete!");
      process.exit();
    }
  );
} else {
  get(process.argv[2], function (err, user) {
    if (err) throw err;
    main(user, function (err) {
      if (err) throw err;
      process.exit();
    });
  });
}

function main(user, callback) {
  async.map(
    user.blogs,
    function (blogID, next) {
      Blog.get({ id: blogID }, next);
    },
    function (err, blogs) {
      if (err) return callback(err);
      var message = [
        "Do you want to delete account " + colors.red(user.email) + "?",
      ];

      if (user.isDisabled) {
        message.push("- " + colors.green("User is disabled"));
      } else {
        message.push("- " + colors.red("User is not disabled"));
      }

      if (user.subscription) {
        message.push(
          "- Will delete Stripe customer " +
            colors.red(user.subscription.customer) +
            " and cancel subscription"
        );
      } else {
        message.push("- No Stripe subscription to remove");
      }

      if (blogs.length) {
        blogs.forEach(function (blog) {
          message.push(
            "- Will delete blog " +
              colors.red(blog.title) +
              " " +
              colors.dim(blog.id) +
              " updated " +
              colors.underline(moment(blog.cacheID).fromNow()) +
              " - http://" +
              blog.handle +
              "." +
              config.host +
              " " +
              blog.domain
          );
        });
      } else {
        message.push("- No blogs to delete");
      }

      getConfirmation(message.join("\n"), function (err, yes) {
        if (!yes) {
          console.log("\nDid not delete " + user.email);
          return callback();
        }

        var req = { user: user, blogs: blogs };
        var res = {};

        async.applyEachSeries(
          async.reflectAll([
            Delete.exports.subscription,
            Delete.exports.blogs,
            Delete.exports.user,
          ]),
          req,
          res,
          function (err, results) {
            if (err) return callback(err);
            console.log();

            if (results[0].error) {
              console.log(
                colors.red("Error deleting blogs: " + results[0].error)
              );
            } else {
              console.log(colors.green("Deleted all the user's blogs!"));
            }

            if (results[1].error) {
              console.log(
                colors.red("Error deleting subscription: " + results[1].error)
              );
            } else {
              console.log(colors.green("Deleted subscription!"));
            }

            if (results[2].error) {
              console.log(
                colors.red("Error deleting user: " + results[2].error)
              );
            } else {
              console.log(colors.green("Deleted user!"));
            }

            if (
              results.slice(2).filter(function (i) {
                return !!i.error;
              }).length
            ) {
              return callback(
                new Error("Unhandled error in results " + results)
              );
            }

            callback();
          }
        );
      });
    }
  );
}
