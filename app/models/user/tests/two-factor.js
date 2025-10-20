describe("user two-factor", function () {
  var User = require("models/user");
  var twoFactor = User.twoFactor;

  var context = {};

  beforeEach(function (done) {
    var email = "twofactor+" + Date.now() + "@example.com";

    User.hashPassword("password", function (err, hash) {
      if (err) return done(err);

      User.create(email, hash, {}, {}, function (err, user) {
        if (err) return done(err);
        context.user = user;
        done();
      });
    });
  });

  afterEach(function (done) {
    twoFactor.testing.reset();
    if (!context.user) return done();
    User.remove(context.user.uid, done);
  });

  it("enables and validates totp", function (done) {
    var secret = "JBSWY3DPEHPK3PXP";

    twoFactor.testing.setTime(1700000000000);

    twoFactor.enable(
      context.user.uid,
      { secret: secret, backupCodes: ["code123456"] },
      function (err) {
        if (err) return done(err);

        twoFactor.testing.setTime(1700000000000);
        var token = twoFactor.testing.generateToken(secret);

        twoFactor.validate(context.user.uid, token, function (err, result) {
          if (err) return done(err);

          expect(result.verified).toBe(true);
          expect(result.method).toBe("totp");

          User.getById(context.user.uid, function (err, user) {
            if (err) return done(err);

            expect(user.twoFactor.enabled).toBe(true);
            expect(user.twoFactor.secret).toBe(secret);
            expect(user.twoFactor.backupCodes.length).toBe(1);
            expect(user.twoFactor.lastUsedAt).not.toBe("");
            done();
          });
        });
      }
    );
  });

  it("consumes backup codes", function (done) {
    var secret = "JBSWY3DPEHPK3PXP";
    var backup = "SAFE123456";

    twoFactor.enable(
      context.user.uid,
      { secret: secret, backupCodes: [backup] },
      function (err) {
        if (err) return done(err);

        twoFactor.validate(context.user.uid, backup, function (err, result) {
          if (err) return done(err);

          expect(result.verified).toBe(true);
          expect(result.method).toBe("backup");

          User.getById(context.user.uid, function (err, user) {
            if (err) return done(err);

            expect(user.twoFactor.backupCodes.length).toBe(0);

            twoFactor.validate(context.user.uid, backup, function (err, retry) {
              if (err) return done(err);

              expect(retry.verified).toBe(false);
              done();
            });
          });
        });
      }
    );
  });

  it("rejects invalid codes", function (done) {
    var secret = "JBSWY3DPEHPK3PXP";

    twoFactor.enable(context.user.uid, { secret: secret }, function (err) {
      if (err) return done(err);

      twoFactor.testing.setTime(1700000000000);

      twoFactor.validate(context.user.uid, "000000", function (err, result) {
        if (err) return done(err);

        expect(result.verified).toBe(false);
        done();
      });
    });
  });
});
