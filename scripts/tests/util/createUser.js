var User = require("models/user");
var randomString = require("./randomString");

module.exports = function (done) {
  var context = this;
  var fakePassword = "XXX-" + Date.now();
  var fakeEmail = randomString(20) + "@example.com";
  var started = Date.now();
  console.log("[test.user.createUser] start", fakeEmail);
  var finished = false;
  var timeout = setTimeout(function () {
    finish(new Error("createUser timed out"));
  }, 10000);

  function finish(err) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    console.log(
      "[test.user.createUser] done",
      err ? err.message : "ok",
      Date.now() - started + "ms"
    );
    done(err);
  }

  User.hashPassword(fakePassword, function (err, passwordHash) {
    if (err) {
      return finish(err);
    }

    User.create(fakeEmail, passwordHash, {}, {}, function (err, user) {
      if (err) {
        return finish(err);
      }

      context.user = user;
      context.user.fakePassword = fakePassword;
      console.log("[test.user.createUser] created", user && user.uid);
      finish();
    });
  });
};
