describe("user", function () {
  global.test.user();

  var User = require("models/user");
  var client = require("models/client");
  var key = require("models/user/key");

  it("sends welcome email immediately when overdue", function (done) {
    var uid = this.user.uid;
    var pastDate = Date.now() - 3 * 60 * 60 * 1000;

    User.set(
      uid,
      { created: pastDate, welcomeEmailSent: false },
      function (err) {
        if (err) return done.fail(err);

        User.scheduleWelcomeEmail(uid, function (err) {
          if (err) return done.fail(err);

          User.getById(uid, function (err, user) {
            if (err) return done.fail(err);

            expect(user.welcomeEmailSent).toBe(true);

            done();
          });
        });
      }
    );
  });

  it("does not reschedule if already sent", function (done) {
    var uid = this.user.uid;
    User.set(uid, { welcomeEmailSent: true }, function (err) {
      if (err) return done.fail(err);

      User.scheduleWelcomeEmail(uid, function (err) {
        if (err) return done.fail(err);

        User.getById(uid, function (err, user) {
          if (err) return done.fail(err);

          expect(user.welcomeEmailSent).toBe(true);
          done();
        });
      });
    });
  });

  it("defaults missing fields when loading legacy users", function (done) {
    var uid = this.user.uid;

    client.get(key.user(uid), function (err, original) {
      if (err) return done.fail(err);

      client.set(
        key.user(uid),
        JSON.stringify({ uid: uid, email: "legacy@example.com" }),
        function (err) {
          if (err) return done.fail(err);

          User.getById(uid, function (err, user) {
            if (err) return done.fail(err);

            expect(user.created).toBe(0);
            expect(user.welcomeEmailSent).toBe(true);

            client.set(key.user(uid), original, function (restoreErr) {
              if (restoreErr) return done.fail(restoreErr);
              done();
            });
          });
        }
      );
    });
  });
});

