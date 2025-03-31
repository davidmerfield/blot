var Express = require("express");
var Delete = new Express.Router();
var User = require("models/user");
var Email = require("helper/email");
var checkPassword = require("./util/checkPassword");
var logout = require("./util/logout");
var async = require("async");

var Blog = require("models/blog");
var config = require("config");
var stripe = require("stripe")(config.stripe.secret);


Delete.route("/")

  .get(function (req, res) {
    res.render("dashboard/account/delete", {
      title: "Delete your account",
      breadcrumb: "Delete",
    });
  })

  .post(
    checkPassword,
    deleteSubscription,
    deleteBlogs,
    deleteUser,
    emailUser,
    logout,
    function (req, res) {
      res.redirect("/sites/deleted");
    }
  );

function emailUser(req, res, next) {
  Email.DELETED("", req.user, next);
}
function deleteBlogs(req, res, next) {
  async.each(req.user.blogs, Blog.remove, next);
}

function deleteUser(req, res, next) {
  User.remove(req.user.uid, next);
}

function deleteSubscription(req, res, next) {
  if (req.user.paypal?.status) {
    fetch(
      `${config.paypal.api_base}/v1/billing/subscriptions/${req.user.paypal.id}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.paypal.client_id}:${config.paypal.secret}`
          ).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Customer deleted account",
        }),
      }
    )
      .then(async (response) => {
        if (response.status !== 204) {
          const error = await response.json();
          throw new Error(`PayPal API error: ${error.message}`);
        }
        console.log("PayPal subscription canceled");
        next();
      })
      .catch((error) => {
        console.error("Error in deleting PayPal subscription:", error);
        next(error); // Pass error to error handler
      });
  } else if (req.user.subscription?.customer) {
    stripe.customers
      .del(req.user.subscription.customer)
      .then((res) => {
        if (!res || res.deleted !== true) {
          throw new Error("Stripe customer not deleted");
        }
        console.log("Stripe customer deleted");
        next()
      })
      .catch((error) => {
        console.error("Error in deleting Stripe customer:", error);
        next(error); // Pass error to error handler
      });
  } else {
    next();
  }
}

// We expose these methods for our scripts
// Hopefully this does not clobber anything in
// the exposed Express application?

if (Delete.exports !== undefined)
  throw new Error(
    "Delete.exports is defined (typeof=" +
      typeof Delete.exports +
      ") Would clobber Delete.exports"
  );

Delete.exports = {
  blogs: deleteBlogs,
  user: deleteUser,
  subscription: deleteSubscription,
};

module.exports = Delete;
