var User = require("models/user");

module.exports = function checkPassword(req, res, next) {
  if (!req.body.password) {
    return next(new Error("Please enter your password"));
  }

  // Verify the supplied password even if it exceeds the new 72-byte limit so
  // users with legacy bcrypt hashes can still confirm their identity.
  User.checkPassword(req.user.uid, req.body.password, function (err, match) {
    if (err) return next(err);

    if (!match) {
      return next(new Error("Your existing password is incorrect."));
    }

    next();
  });
};
