describe("user consumeTotpBackupCode", function () {
  global.test.user();

  var User = require("../index");
  var consumeTotpBackupCode = require("../consumeTotpBackupCode");

  beforeEach(function (done) {
    var test = this;
    User.set(test.user.uid, { totpBackupCodes: ["hash-a", "hash-b"] }, done);
  });

  it("consumes a present hash and removes only that one", function (done) {
    var test = this;

    consumeTotpBackupCode(test.user.uid, "hash-a", function (err, consumed) {
      if (err) return done.fail(err);
      expect(consumed).toBe(true);

      User.getById(test.user.uid, function (err, user) {
        if (err) return done.fail(err);
        expect(user.totpBackupCodes).toEqual(["hash-b"]);
        done();
      });
    });
  });

  it("reports false and makes no change when the hash is already gone", function (done) {
    var test = this;

    consumeTotpBackupCode(test.user.uid, "hash-a", function (err, first) {
      if (err) return done.fail(err);
      expect(first).toBe(true);

      // Simulates a second, concurrent request racing for the same code:
      // it must not also report success once the first has consumed it.
      consumeTotpBackupCode(test.user.uid, "hash-a", function (err, second) {
        if (err) return done.fail(err);
        expect(second).toBe(false);
        done();
      });
    });
  });

  it("reports false for a hash that was never present", function (done) {
    var test = this;

    consumeTotpBackupCode(test.user.uid, "not-a-real-hash", function (err, consumed) {
      if (err) return done.fail(err);
      expect(consumed).toBe(false);
      done();
    });
  });
});
