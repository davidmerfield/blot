var User = require("models/user");
var authenticate = require("./authenticate");

// Finishes logging a user in once any second factor has been satisfied:
// sets the session cookie and redirects to `then`, issuing the short-lived
// token account/password's "/set" route needs (to let the user choose a
// password without already having one) when `then` is that route. Callers
// are responsible for defaulting `then` the same way they would have
// without a second factor -- this only adds the second-factor gate, not a
// second opinion on where a login should land.
module.exports = function completeLogin(req, res, user, then, callback) {
  authenticate(req, res, user);

  if (then !== "/sites/account/password/set") {
    return callback(null, then);
  }

  User.generateAccessToken({ uid: user.uid }, function (err, token) {
    if (err) return callback(err);

    req.session.passwordSetToken = token;
    callback(null, then);
  });
};
