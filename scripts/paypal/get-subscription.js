const config = require("config");
const get = require("../get/user");
const fetch = require("node-fetch");
const getConfirmation = require("../util/getConfirmation");
const colors = require("colors/safe");
const User = require("models/user");
const each = require("../each/user");

async function main(user, callback) {
  if (!user.paypal || !user.paypal.id) {
    console.log(
      colors.dim(
        "User:",
        user.uid,
        user.email,
        "does not have a PayPal subscription"
      )
    );
    return callback();
  }

  const response = await fetch(
    `${config.paypal.api_base}/v1/billing/subscriptions/${user.paypal.id}`,
    {
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en_US",
        Authorization: `Basic ${Buffer.from(
          `${config.paypal.client_id}:${config.paypal.secret}`
        ).toString("base64")}`,
      },
    }
  );

  let paypal;

  try {
    paypal = await response.json();
  } catch (e) {
    console.log(e);
  }

  if (!paypal || !paypal.id || paypal.id !== user.paypal.id) {
    console.log(
      colors.red(
        "User:",
        user.uid,
        user.email,
        "does not have a matching PayPal subscription anymore"
      )
    );
    return callback();
  }

  User.set(user.uid, { paypal }, function (err) {
    if (err) return callback(err);
    console.log(
      colors.green(
        "User:",
        user.uid,
        user.email,
        "subscription updated from PayPal"
      )
    );
    callback(null);
  });
}

module.exports = main;

if (require.main === module) {
  if (process.argv[2]) {
    get(process.argv[2], function (err, user) {
      main(user, function (err, res) {
        if (err) throw err;
        console.log(res);
      });
    });
  } else {
    getConfirmation(
      "Fetch latest subscription information from PayPal for all users? (y/N)",
      function (err, ok) {
        if (!ok) return process.exit();
        each(main, function (err) {
          if (err) throw err;
          console.log("Done!");
          process.exit();
        });
      }
    );
  }
}
