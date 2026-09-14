const checkEmail = require("../checkEmail");
const checkPassword = require("../checkPassword");
const {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
} = require("dashboard/util/auth-limits");

describe("log in authentication limits", function () {
  it("rejects an email that is too long before looking it up", function () {
    const req = { body: { email: "a".repeat(MAX_EMAIL_LENGTH + 1) } };
    const res = { locals: {} };

    checkEmail(req, res, function (err) {
      expect(err.code).toEqual("EMAILTOOLONG");
    });
  });

  it("rejects a password that is too long before checking it", function () {
    const req = {
      body: { password: "a".repeat(MAX_PASSWORD_LENGTH + 1) },
      query: {},
      user: { uid: "too-long-password" },
    };
    const res = {};

    checkPassword(req, res, function (err) {
      expect(err.code).toEqual("PASSWORDTOOLONG");
    });
  });
});
