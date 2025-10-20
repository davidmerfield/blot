var User = require("models/user");
var authenticate = require("./authenticate");

module.exports = function checkTwoFactor(req, res, next) {
  var user = req.user;
  var pending = req.session && req.session.pendingLogin;

  if (!user || !user.twoFactor || !user.twoFactor.enabled) return next();

  if (
    !pending ||
    pending.uid !== user.uid ||
    pending.type !== "two-factor"
  ) {
    return next();
  }

  var token = req.body && req.body.token;

  function render(status, flags) {
    res.status(status);
    res.locals.email = pending.email || user.email;
    res.locals.then = pending.then;

    if (flags) {
      Object.keys(flags).forEach(function (flag) {
        res.locals[flag] = true;
      });
    }

    res.render("dashboard/log-in/two-factor");
  }

  if (token === "") {
    return render(403, { NOTWOFACTORTOKEN: true });
  }

  if (token === undefined) {
    return render(200);
  }

  User.twoFactor.validate(user.uid, token, function (err, result) {
    if (err) return next(err);

    if (!result || !result.verified) {
      return render(403, { BADTWOFACTOR: true });
    }

    delete req.session.pendingLogin;

    authenticate(req, res, user);

    res.redirect(pending.then || "/sites");
  });
};
