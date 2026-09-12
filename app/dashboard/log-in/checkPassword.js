var User = require("models/user");
var LogInError = require("./logInError");
var authenticate = require("./authenticate");

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

    if (user.totpEnabled) {
      req.session.pendingTotpUid = user.uid;
      req.session.pendingTotpThen = then;
      return res.redirect("/log-in/two-factor");
    }

    authenticate(req, res, user);

    return res.redirect(then);
  });
};
