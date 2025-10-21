var send = require("helper/email").send;
var getConfirmation = require("../util/getConfirmation");
var async = require("async");
var fs = require("fs-extra");
var colors = require("colors/safe");

module.exports = function (emailFile, users, callback) {
  if (!users.length)
    return callback(new Error("No users in list of users to send email to."));

  var unique = {};

  users = users.filter(function (user) {
    if (unique[user.email]) return false;
    unique[user.email] = true;
    return true;
  });

  console.log(
    colors.dim("-------------------\n") +
      fs.readFileSync(emailFile, "utf-8") +
      colors.dim("\n-------------------\n")
  );

  getConfirmation(
    "Send email to " + colors.green(users.length + " users") + "? (y/n)",
    function (err, ok) {
      if (!ok) {
        console.log("Emails were not sent.");
        return process.exit();
      }

      async.eachSeries(
        users,
        function (user, next) {
          send(user, emailFile, user.email, function (err) {
            if (err) console.log("Error sending message to", user.email);
            next();
          });
        },
        function (err) {
          if (err) return callback(err);

          console.log("Emails sent");
          callback();
        }
      );
    }
  );
};
