var User = require("models/user");
var LogInError = require("./logInError");
var authenticate = require("./authenticate");
var pendingTotp = require("./pendingTotp");

module.exports = function checkPassword(req, res, next) {
  var user = req.user;
  var password = req.body && req.body.password;
  var then = req.query.then || req.body.then || "/sites";

  if (password === "") {
    return next(new LogInError("NOPASSWORD"));
  }

  if (password === undefined) {
    return res.render("dashboard/log-in/password");
  }

  User.checkPassword(user.uid, password, function (err, match) {
    if (err) return next(err);

    if (!match) return next(new LogInError("BADPASSWORD"));

    // Re-read the account rather than trusting the copy checkEmail loaded
    // earlier in the middleware chain: if TOTP enrollment completed in the
    // meantime, that snapshot would still show it disabled and let a
    // correct-password request skip the second factor entirely.
    User.getById(user.uid, function (err, freshUser) {
      if (err) return next(err);
      if (!freshUser) return next(new LogInError("NOUSER"));

      if (freshUser.totpEnabled) {
        pendingTotp.set(req, freshUser.uid, then);
        return res.redirect("/log-in/two-factor");
      }

      authenticate(req, res, freshUser);

      return res.redirect(then);
    });
  });
};
