var User = require("models/user");
var Blog = require("models/blog");
var async = require("async");
var get = require("../get/user");
var each = require("../each/user");
var config = require("config");
var stripe = require("stripe")(config.stripe.secret);
var async = require("async");
var getConfirmation = require("../util/getConfirmation");
var moment = require("moment");
var colors = require("colors/safe");

function main(user, callback) {
  var message = [""];

  if (user.subscription && user.subscription.current_period_end) {
    var ed =
      user.subscription.current_period_end * 1000 > Date.now() ? "s " : "ed ";
    message.push(
      "User " +
        colors.yellow(user.email) +
        " " +
        colors.dim(user.uid) +
        " has an " +
        user.subscription.status +
        " " +
        user.subscription.plan.interval +
        "ly subscription which end" +
        ed +
        colors.underline(
          moment(user.subscription.current_period_end * 1000).fromNow()
        )
    );
  } else {
    message.push(
      "User " +
        colors.yellow(user.email) +
        " " +
        colors.dim(user.uid) +
        " does not have a subscription"
    );
  }

  async.map(
    user.blogs,
    function (blogID, next) {
      Blog.get({ id: blogID }, next);
    },
    function (err, blogs) {
      blogs.forEach(function (blog) {
        if (!blog) {
          message.push(colors.red("Warning no blog with ID " + user.blogs));
          return;
        }

        message.push(
          "Blog " +
            colors.yellow(blog.title) +
            " " +
            colors.dim(blog.id) +
            " was updated " +
            colors.underline(moment(blog.cacheID).fromNow()) +
            " - https://" +
            blog.handle +
            "." +
            config.host +
            " " +
            blog.domain
        );
      });
      message.push(
        "Are you sure you want to disable " +
          colors.yellow(user.email) +
          "? (y/n)"
      );
      getConfirmation(message.join("\n"), function (err, ok) {
        if (!ok) {
          console.log(colors.red("Did not disable " + user.email));
          return callback();
        }
        async.eachSeries(
          user.blogs,
          function (blogID, next) {
            Blog.set(blogID, { isDisabled: true }, next);
          },
          function () {
            User.set(user.uid, { isDisabled: true }, function (err) {
              if (err) return callback(err);
              console.log(colors.green("Disabled " + user.email));
              callback();
            });
          }
        );
      });
    }
  );
}

if (process.argv[2]) {
  get(process.argv[2], function (err, user) {
    if (err) throw err;
    main(user, function (err) {
      if (err) throw err;
      process.exit();
    });
  });
} else {
  console.log("Searching for users to disable");
  each(
    function (user, next) {
      if (user.isDisabled) return next();

      // If the user doesn't have a Stripe subscription
      // they were probably an early user – don't disable
      if (
        !user.subscription ||
        !user.subscription.status ||
        !user.subscription.id
      ) {
        return next();
      }

      // If the user's subscription period isn't over don't disable
      if (
        user.subscription &&
        user.subscription.current_period_end > Date.now() / 1000
      ) {
        return next();
      }

      stripe.customers.retrieveSubscription(
        user.subscription.customer,
        user.subscription.id,
        function (err, subscription) {
          if (err && err.code === "resource_missing" && err.param === "id") {
            console.log(
              "used to have a Stripe subscription but no longer does, customer does not exist on Stripe"
            );
            return main(user, next);
          }

          if (
            err &&
            err.code === "resource_missing" &&
            err.param === "subscription"
          ) {
            // we should list any subscriptions this user has to make sure
            console.log(
              'used to have a Stripe subscription but no longer does, customer still exists on Stripe"'
            );
            return main(user, next);
          }

          if (err) return next(err);

          if (
            subscription.current_period_end < Date.now() / 1000 &&
            subscription.status !== "active"
          ) {
            console.log("has an overdue stripe subscription");
            return main(user, next);
          }

          next();
        }
      );
    },
    function (err) {
      if (err) throw err;
      console.log("Search complete!");
      process.exit();
    }
  );
}
