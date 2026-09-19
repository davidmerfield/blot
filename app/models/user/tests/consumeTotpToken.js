describe("user consumeTotpToken", function () {
  global.test.user();

  var User = require("../index");
  var consumeTotpToken = require("../consumeTotpToken");

  it("accepts a code the first time it's used", function (done) {
    var test = this;

    consumeTotpToken(test.user.uid, "123456", function (err, accepted) {
      if (err) return done.fail(err);
      expect(accepted).toBe(true);
      done();
    });
  });

  it("rejects the same code reused shortly afterwards", function (done) {
    var test = this;

    consumeTotpToken(test.user.uid, "123456", function (err, first) {
      if (err) return done.fail(err);
      expect(first).toBe(true);

      consumeTotpToken(test.user.uid, "123456", function (err, second) {
        if (err) return done.fail(err);
        expect(second).toBe(false);
        done();
      });
    });
  });

  it("accepts a different code even right after the last one", function (done) {
    var test = this;

    consumeTotpToken(test.user.uid, "123456", function (err, first) {
      if (err) return done.fail(err);
      expect(first).toBe(true);

      consumeTotpToken(test.user.uid, "654321", function (err, second) {
        if (err) return done.fail(err);
        expect(second).toBe(true);
        done();
      });
    });
  });

  it("accepts the same code again once its replay window has passed", function (done) {
    var test = this;

    consumeTotpToken(test.user.uid, "123456", function (err, first) {
      if (err) return done.fail(err);
      expect(first).toBe(true);

      User.set(
        test.user.uid,
        { totpUsedCodes: [{ code: "123456", at: Date.now() - 91 * 1000 }] },
        function (err) {
          if (err) return done.fail(err);

          consumeTotpToken(test.user.uid, "123456", function (err, second) {
            if (err) return done.fail(err);
            expect(second).toBe(true);
            done();
          });
        }
      );
    });
  });

  it("rejects an earlier code replayed after a different code was accepted in between", function (done) {
    var test = this;

    // Regression test: with only the single most-recently-accepted code
    // tracked, accepting "654321" would forget that "123456" is still
    // within its own replay window, letting a captured "123456" through.
    consumeTotpToken(test.user.uid, "123456", function (err, first) {
      if (err) return done.fail(err);
      expect(first).toBe(true);

      consumeTotpToken(test.user.uid, "654321", function (err, second) {
        if (err) return done.fail(err);
        expect(second).toBe(true);

        consumeTotpToken(test.user.uid, "123456", function (err, third) {
          if (err) return done.fail(err);
          expect(third).toBe(false);
          done();
        });
      });
    });
  });
});
