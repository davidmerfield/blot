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
      if (err) return resolve({ error: err });
      reject(new Error("checkTotp did not respond"));
    });
  });
}

describe("log-in checkTotp", function () {
  beforeEach(function () {
    spyOn(User, "getById").and.callFake(function (uid, callback) {
      callback(null, { uid: uid });
    });
  });

  it("rejects a missing code", async function () {
    var result = await request({ pendingTotpUid: "user_1" }, {});
    expect(result.error.code).toEqual("NOTOTPCODE");
  });

  it("rejects an invalid code", async function () {
    spyOn(User, "checkTotp").and.callFake(function (uid, code, callback) {
      callback(null, false);
    });

    var result = await request(
      { pendingTotpUid: "user_1" },
      { code: "000000" }
    );

    expect(result.error.code).toEqual("BADTOTPCODE");
  });

  it("authenticates and clears the pending session state on a valid code", async function () {
    spyOn(User, "checkTotp").and.callFake(function (uid, code, callback) {
      callback(null, true, "totp");
    });

    var session = {
      pendingTotpUid: "user_1",
      pendingTotpThen: "/sites/some-site",
    };

    var result = await request(session, { code: "123456" });

    expect(result.redirect).toEqual("/sites/some-site");
    expect(session.uid).toEqual("user_1");
    expect(session.pendingTotpUid).toBeUndefined();
    expect(session.pendingTotpThen).toBeUndefined();
  });
});
