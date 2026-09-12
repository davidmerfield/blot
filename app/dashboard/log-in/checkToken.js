var User = require("models/user");
var completeLogin = require("./completeLogin");
var LogInError = require("./logInError");

// The purpose of this function is to check to see if the
// user has requested the log in page with a one-time access
// token. If so, validate it, then redirect the user to the
// appropriate page: the dashboard homepage or somewhere specified
// in the query 'then'.
module.exports = function checkToken(req, res, next) {
  var token, then;

  // There is no token,  then proceed to the next middleware.
  if (!req.query || !req.query.token) return next();

  token = req.query.token;

  // I had previously introduced a bug caused by the fact
  // decodeURIComponent(undefined) === 'undefined'
  // First check that there is 'then' query before attempting to decode
  // We check 'amp;then' because I click links in my terminal which
  // does something (or doesn't do something) to ampersands.
  if (req.query.then || req.query["amp;then"])
    then = decodeURIComponent(req.query.then || req.query["amp;then"]);

  // A magic link only ever sends the user to the dashboard homepage,
  // except for the one special case of setting a password for the first
  // time -- any other 'then' is ignored, same as before TOTP existed.
  var effectiveThen =
    then === "/sites/account/password/set" ? then : "/sites";

  // First we make sure that the access token passed is valid.
  User.checkAccessToken(token, function (err, uid) {
    if (err) return next(new LogInError("BADTOKEN"));

    // Then we load the user associated with the access token.
    // Tokens are stored against UIDs in the database.
    User.getById(uid, function (err, user) {
      if (err || !user) return next(new LogInError("NOUSER"));

      // You used to be able to disable your account
      // but this is no longer possible. Once all
      // users with isDisabled:true are removed you
      // can delete this check safely.
      if (user.isDisabled) return res.redirect("/disabled");

      // A one-time log-in link (e.g. from a password-reset email) proves
      // the user controls their email, not their authenticator app -- it
      // must not bypass a second factor they've enabled.
      if (user.totpEnabled) {
        req.session.pendingTotpUid = user.uid;
        req.session.pendingTotpThen = effectiveThen;
        return res.redirect("/log-in/two-factor");
      }

      completeLogin(req, res, user, effectiveThen, function (err, redirectTo) {
        if (err) return next(err);
        res.redirect(redirectTo);
      });
    });
  });
};
