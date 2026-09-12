var User = require("models/user");
var LogInError = require("./logInError");
var completeLogin = require("./completeLogin");
var pendingTotp = require("./pendingTotp");

module.exports = function checkTotp(req, res, next) {
  var pending = pendingTotp.get(req);
  var code = req.body && req.body.code;

  if (!pending) return res.redirect("/log-in");

  if (!code) return next(new LogInError("NOTOTPCODE"));

  User.checkTotp(pending.uid, code, function (err, valid) {
    if (err) return next(err);
    if (!valid) return next(new LogInError("BADTOTPCODE"));

    User.getById(pending.uid, function (err, user) {
      if (err) return next(err);
      if (!user) return next(new LogInError("NOUSER"));

      pendingTotp.clear(req);

      completeLogin(req, res, user, pending.then, function (err, redirectTo) {
        if (err) return next(err);
        res.redirect(redirectTo);
      });
    });
  });
};
