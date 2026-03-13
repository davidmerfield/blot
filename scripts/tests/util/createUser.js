var User = require("models/user");
var randomString = require("./randomString");

module.exports = function (done) {
  var context = this;
  var fakePassword = "XXX-" + Date.now();
  var fakeEmail = randomString(20) + "@example.com";

  User.hashPassword(fakePassword, function (err, passwordHash) {
    if (err) {
      return done(err);
    }

    User.create(fakeEmail, passwordHash, {}, {}, function (err, user) {
      if (err) {
        return done(err);
      }

      context.user = user;
      context.user.fakePassword = fakePassword;
      done();
    });
  });
};
