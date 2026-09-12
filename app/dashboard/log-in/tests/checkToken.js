var checkToken = require("../checkToken");
var User = require("models/user");

function request(query) {
  return new Promise(function (resolve, reject) {
    var session = {};
    var req = { query: query || {}, session: session };
    var res = {
      cookie: function () {},
      redirect: function (location) {
        resolve({ redirect: location, session: session });
      },
    };

    checkToken(req, res, function (err) {
      if (err) return resolve({ error: err, session: session });
      reject(new Error("checkToken did not respond"));
    });
  });
}

describe("log-in checkToken", function () {
  beforeEach(function () {
    spyOn(User, "checkAccessToken").and.callFake(function (token, callback) {
      callback(null, "user_1");
    });
  });

  it("does not authenticate a magic link directly when TOTP is enabled", async function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, isDisabled: false, totpEnabled: true });
    });

    var result = await request({ token: "sometoken" });

    expect(result.redirect).toEqual("/log-in/two-factor");
    expect(result.session.uid).toBeUndefined();
    expect(result.session.pendingTotpUid).toEqual("user_1");
    expect(result.session.pendingTotpThen).toEqual("/sites");
  });

  it("preserves the password/set destination when routing through TOTP", async function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, isDisabled: false, totpEnabled: true });
    });

    var result = await request({
      token: "sometoken",
      then: encodeURIComponent("/sites/account/password/set"),
    });

    expect(result.redirect).toEqual("/log-in/two-factor");
    expect(result.session.pendingTotpThen).toEqual(
      "/sites/account/password/set"
    );
  });

  it("authenticates directly when TOTP is not enabled", async function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, isDisabled: false, totpEnabled: false });
    });

    var result = await request({ token: "sometoken" });

    expect(result.redirect).toEqual("/sites");
    expect(result.session.uid).toEqual("user_1");
    expect(result.session.pendingTotpUid).toBeUndefined();
  });
});
