var checkToken = require("../checkToken");
var User = require("models/user");

function request(query, session) {
  return new Promise(function (resolve, reject) {
    session = session || {};
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
    expect(result.session.pendingTotp.uid).toEqual("user_1");
    expect(result.session.pendingTotp.then).toEqual("/sites");
    expect(result.session.pendingTotp.createdAt).toEqual(jasmine.any(Number));
  });

  it("clears an existing authenticated session so the challenge isn't skipped", async function () {
    // A user already signed in (e.g. a stale session) who opens a
    // password-reset link must still be forced through the challenge --
    // otherwise the log-in router's "already signed in" guard would
    // redirect them away from /log-in/two-factor before it can run.
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid, isDisabled: false, totpEnabled: true });
    });

    var session = { uid: "some-other-previously-logged-in-uid" };

    var result = await request({ token: "sometoken" }, session);

    expect(result.redirect).toEqual("/log-in/two-factor");
    expect(result.session.uid).toBeUndefined();
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
    expect(result.session.pendingTotp.then).toEqual(
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
    expect(result.session.pendingTotp).toBeUndefined();
  });
});
