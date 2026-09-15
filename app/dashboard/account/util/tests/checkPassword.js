var User = require("models/user");
var checkPassword = require("../checkPassword");
var { MAX_PASSWORD_LENGTH } = require("models/user/auth-limits");

describe("account password verification", function () {
  it("still verifies a legacy password longer than the new hash limit", function (done) {
    var password = "a".repeat(MAX_PASSWORD_LENGTH + 1);

    spyOn(User, "checkPassword").and.callFake(function (uid, supplied, callback) {
      callback(null, true);
    });

    checkPassword(
      { body: { password }, user: { uid: "legacy-password" } },
      {},
      function (err) {
        expect(err).toBeUndefined();
        expect(User.checkPassword).toHaveBeenCalledWith(
          "legacy-password",
          password,
          jasmine.any(Function)
        );
        done();
      }
    );
  });
});
