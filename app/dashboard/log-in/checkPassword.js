var User = require("models/user");
var LogInError = require("./logInError");
var authenticate = require("./authenticate");

module.exports = function checkPassword(req, res, next) {
  var user = req.user;
  var password = req.body && req.body.password;
  var then = req.query.then || req.body.then || "/sites";
  var pending = req.session && req.session.pendingLogin;
  var hasPendingChallenge =
    pending && pending.uid === user.uid && pending.type === "two-factor";

  if (password === "") {
    return next(new LogInError("NOPASSWORD"));
  }

  if (password !== undefined && pending) {
    delete req.session.pendingLogin;
    hasPendingChallenge = false;
  }

  if (password === undefined && hasPendingChallenge) {
    return next();
  }

  if (password === undefined) {
    return res.render("dashboard/log-in/password");
  }

  User.checkPassword(user.uid, password, function (err, match) {
    if (err) return next(err);

    if (!match) return next(new LogInError("BADPASSWORD"));

    if (user.twoFactor && user.twoFactor.enabled) {
      if (!req.session) {
        return next(new Error("Session required"));
      }

      req.session.pendingLogin = {
        uid: user.uid,
        email: user.email,
        then: then,
        type: "two-factor",
        createdAt: Date.now(),
      };

      return next();
    }

    authenticate(req, res, user);

    return res.redirect(then);
  });
};
