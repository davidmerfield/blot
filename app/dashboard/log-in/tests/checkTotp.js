var checkTotp = require("../checkTotp");
var User = require("models/user");

function request(session, body) {
  return new Promise(function (resolve, reject) {
    var req = { session: session, body: body || {} };
    var res = {
      cookie: function () {},
      redirect: function (location) {
        resolve({ redirect: location, session: session });
      },
    };

    checkTotp(req, res, function (err) {
      if (err) return resolve({ error: err, session: session });
      reject(new Error("checkTotp did not respond"));
    });
  });
}

function pending(uid, then) {
  return { uid: uid, then: then, createdAt: Date.now() };
}

describe("log-in checkTotp", function () {
  beforeEach(function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid });
    });
  });

  it("redirects to log-in when there is no pending challenge", async function () {
    var result = await request({}, { code: "123456" });
    expect(result.redirect).toEqual("/log-in");
  });

  it("redirects to log-in when the pending challenge has expired", async function () {
    var expired = pending("user_1", "/sites");
    expired.createdAt = Date.now() - 11 * 60 * 1000;

    var result = await request({ pendingTotp: expired }, { code: "123456" });
    expect(result.redirect).toEqual("/log-in");
  });

  it("rejects a missing code", async function () {
    var result = await request({ pendingTotp: pending("user_1") }, {});
    expect(result.error.code).toEqual("NOTOTPCODE");
  });

  it("rejects an invalid code", async function () {
    spyOn(User, "checkTotp").and.callFake(function (uid, code, callback) {
      callback(null, false);
    });

    var result = await request(
      { pendingTotp: pending("user_1") },
      { code: "000000" }
    );

    expect(result.error.code).toEqual("BADTOTPCODE");
  });

  it("authenticates and clears the pending session state on a valid code", async function () {
    spyOn(User, "checkTotp").and.callFake(function (uid, code, callback) {
      callback(null, true, "totp");
    });

    var session = { pendingTotp: pending("user_1", "/sites/some-site") };

    var result = await request(session, { code: "123456" });

    expect(result.redirect).toEqual("/sites/some-site");
    expect(session.uid).toEqual("user_1");
    expect(session.pendingTotp).toBeUndefined();
  });
});
