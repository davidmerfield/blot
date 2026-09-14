var checkPassword = require("../checkPassword");
var User = require("models/user");

function request(reqUser, body) {
  return new Promise(function (resolve, reject) {
    var session = {};
    var req = {
      user: reqUser,
      body: body || {},
      query: {},
      session: session,
    };
    var res = {
      cookie: function () {},
      redirect: function (location) {
        resolve({ redirect: location, session: session });
      },
    };

    checkPassword(req, res, function (err) {
      if (err) return resolve({ error: err, session: session });
      reject(new Error("checkPassword did not respond"));
    });
  });
}

describe("log-in checkPassword", function () {
  beforeEach(function () {
    spyOn(User, "checkPassword").and.callFake(function (uid, password, callback) {
      callback(null, password === "correct-password");
    });
  });

  it("re-reads the account instead of trusting the stale copy from checkEmail", async function () {
    // Simulate TOTP enrollment completing between checkEmail's read (the
    // stale `totpEnabled: false` on req.user) and this middleware running.
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, totpEnabled: true });
    });

    var result = await request(
      { uid: "user_1", totpEnabled: false },
      { password: "correct-password" }
    );

    expect(result.redirect).toEqual("/log-in/two-factor");
    expect(result.session.pendingTotp.uid).toEqual("user_1");
  });

  it("authenticates directly when the fresh read shows TOTP still disabled", async function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, totpEnabled: false });
    });

    var result = await request(
      { uid: "user_1", totpEnabled: false },
      { password: "correct-password" }
    );

    expect(result.redirect).toEqual("/sites");
    expect(result.session.uid).toEqual("user_1");
    expect(result.session.pendingTotp).toBeUndefined();
  });
});
