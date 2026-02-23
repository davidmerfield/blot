module.exports = function (done) {
  var User = require("models/user");
  var started = Date.now();
  if (!this.user || !this.user.uid) {
    console.log("[test.user.removeUser] skip missing user");
    return done();
  }
  var uid = this.user.uid;
  console.log("[test.user.removeUser] start", uid);
  var finished = false;
  var timeout = setTimeout(function () {
    finish(new Error("removeUser timed out"));
  }, 10000);

  function finish(err) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    console.log(
      "[test.user.removeUser] done",
      uid,
      err ? err.message : "ok",
      Date.now() - started + "ms"
    );
    done(err);
  }

  User.remove(uid, function (err) {
    if (err) {
      return finish(err);
    }

    finish();
  });
};
