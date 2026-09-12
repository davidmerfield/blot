var User = require("models/user");
var LogInError = require("./logInError");
var authenticate = require("./authenticate");

module.exports = function checkTotp(req, res, next) {
  var uid = req.session.pendingTotpUid;
  var code = req.body && req.body.code;
  var then = req.session.pendingTotpThen || "/sites";

  if (!code) return next(new LogInError("NOTOTPCODE"));

  User.checkTotp(uid, code, function (err, valid) {
    if (err) return next(err);
    if (!valid) return next(new LogInError("BADTOTPCODE"));

    User.getById(uid, function (err, user) {
      if (err) return next(err);
      if (!user) return next(new LogInError("NOUSER"));

      delete req.session.pendingTotpUid;
      delete req.session.pendingTotpThen;

      authenticate(req, res, user);

      res.redirect(then);
    });
  });
};
