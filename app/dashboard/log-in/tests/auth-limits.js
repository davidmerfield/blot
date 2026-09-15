const User = require("models/user");
const checkEmail = require("../checkEmail");
const checkPassword = require("../checkPassword");
const { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH } = require("models/user/auth-limits");

describe("log in authentication limits", function () {
  it("rejects an email that is too long before looking it up", function (done) {
    spyOn(User, "getByEmail");

    checkEmail(
      { body: { email: "a".repeat(MAX_EMAIL_LENGTH + 1) } },
      { locals: {} },
      function (err) {
        expect(err.code).toEqual("EMAILTOOLONG");
        expect(User.getByEmail).not.toHaveBeenCalled();
        done();
      }
    );
  });

  it("still verifies a legacy password longer than the new hash limit", function (done) {
    const password = "a".repeat(MAX_PASSWORD_LENGTH + 1);

    spyOn(User, "checkPassword").and.callFake(function (uid, supplied, callback) {
      callback(null, true);
    });

    const req = {
      body: { password },
      query: {},
      user: { uid: "too-long-password" },
      session: {},
    };
    const res = {
      cookie: function () {},
      redirect: function (url) {
        expect(url).toEqual("/sites");
        expect(User.checkPassword).toHaveBeenCalledWith(
          "too-long-password",
          password,
          jasmine.any(Function)
        );
        done();
      },
    };

    checkPassword(req, res, function (err) {
      done.fail(err || new Error("legacy overlong passwords must still be verified"));
    });
  });
});
