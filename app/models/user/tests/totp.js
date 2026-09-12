describe("user totp", function () {
  global.test.user();

  var User = require("../index");
  var otplib = require("otplib");

  it("enables totp and returns backup codes", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err, codes) {
      if (err) return done.fail(err);

      expect(codes.length).toEqual(10);

      User.getById(test.user.uid, function (err, user) {
        if (err) return done.fail(err);

        expect(user.totpEnabled).toBe(true);
        expect(user.totpSecret).not.toEqual(secret);
        expect(user.totpBackupCodes.length).toEqual(10);
        done();
      });
    });
  });

  it("checkTotp accepts a valid code from the authenticator secret", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err) {
      if (err) return done.fail(err);

      var token = otplib.authenticator.generate(secret);

      User.checkTotp(test.user.uid, token, function (err, valid, method) {
        if (err) return done.fail(err);

        expect(valid).toBe(true);
        expect(method).toEqual("totp");
        done();
      });
    });
  });

  it("checkTotp rejects a replayed code even though it is still within its valid window", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err) {
      if (err) return done.fail(err);

      var token = otplib.authenticator.generate(secret);

      User.checkTotp(test.user.uid, token, function (err, valid) {
        if (err) return done.fail(err);
        expect(valid).toBe(true);

        // Simulates the same code being captured (phishing, logs, a shared
        // screen) and reused by someone else while it's still valid.
        User.checkTotp(test.user.uid, token, function (err, replayedValid) {
          if (err) return done.fail(err);
          expect(replayedValid).toBe(false);
          done();
        });
      });
    });
  });

  it("checkTotp rejects an incorrect code", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err) {
      if (err) return done.fail(err);

      User.checkTotp(test.user.uid, "000000", function (err, valid) {
        if (err) return done.fail(err);
        expect(valid).toBe(false);
        done();
      });
    });
  });

  it("checkTotp accepts and consumes a backup code exactly once", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err, codes) {
      if (err) return done.fail(err);

      var code = codes[0];

      User.checkTotp(test.user.uid, code, function (err, valid, method) {
        if (err) return done.fail(err);
        expect(valid).toBe(true);
        expect(method).toEqual("backup");

        User.checkTotp(test.user.uid, code, function (err, validAgain) {
          if (err) return done.fail(err);
          expect(validAgain).toBe(false);
          done();
        });
      });
    });
  });

  it("regenerateTotpBackupCodes replaces the backup codes", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err, originalCodes) {
      if (err) return done.fail(err);

      User.regenerateTotpBackupCodes(test.user.uid, function (err, newCodes) {
        if (err) return done.fail(err);

        expect(newCodes.length).toEqual(10);
        expect(newCodes).not.toEqual(originalCodes);

        User.checkTotp(test.user.uid, originalCodes[0], function (err, valid) {
          if (err) return done.fail(err);
          expect(valid).toBe(false);
          done();
        });
      });
    });
  });

  it("enableTotp reports a conflict instead of silently overwriting a concurrent write", function (done) {
    var test = this;
    var client = require("models/client");
    var secret = User.generateTotpSecret();

    var realGet = client.get.bind(client);
    var raced = false;

    spyOn(client, "get").and.callFake(function (k) {
      return realGet(k).then(function (value) {
        if (raced) return value;
        raced = true;

        // Simulate a second request's write landing between our read and
        // our compare-and-swap write.
        return new Promise(function (resolve) {
          User.set(test.user.uid, { lastSession: "raced" }, function () {
            resolve(value);
          });
        });
      });
    });

    User.enableTotp(test.user.uid, secret, function (err) {
      expect(err).toEqual(jasmine.any(Error));
      expect(err.code).toEqual("ECONFLICT");
      done();
    });
  });

  it("regenerateTotpBackupCodes reports a conflict instead of silently overwriting a concurrent write", function (done) {
    var test = this;
    var client = require("models/client");
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err) {
      if (err) return done.fail(err);

      var realGet = client.get.bind(client);
      var raced = false;

      spyOn(client, "get").and.callFake(function (k) {
        return realGet(k).then(function (value) {
          if (raced) return value;
          raced = true;

          return new Promise(function (resolve) {
            User.set(test.user.uid, { lastSession: "raced" }, function () {
              resolve(value);
            });
          });
        });
      });

      User.regenerateTotpBackupCodes(test.user.uid, function (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.code).toEqual("ECONFLICT");
        done();
      });
    });
  });

  it("disableTotp clears the secret and backup codes", function (done) {
    var test = this;
    var secret = User.generateTotpSecret();

    User.enableTotp(test.user.uid, secret, function (err) {
      if (err) return done.fail(err);

      User.disableTotp(test.user.uid, function (err) {
        if (err) return done.fail(err);

        User.getById(test.user.uid, function (err, user) {
          if (err) return done.fail(err);

          expect(user.totpEnabled).toBe(false);
          expect(user.totpSecret).toEqual("");
          expect(user.totpBackupCodes).toEqual([]);
          done();
        });
      });
    });
  });
});
