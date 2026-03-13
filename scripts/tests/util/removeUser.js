module.exports = function (done) {
  var User = require("models/user");
  var uid = this.user.uid;

  User.remove(uid, function (err) {
    if (err) {
      return done(err);
    }

    done();
  });
};
