var TwoFactor = require("../two-factor");
var User = require("models/user");

function request(options) {
  return new Promise(function (resolve, reject) {
    var session = options.session || {};
    var req = {
      method: options.method || "GET",
      url: options.url,
      user: options.user || {
        uid: "two-factor-route-user",
        email: "user@example.com",
        hasPassword: true,
        totpEnabled: false,
      },
      session: session,
      body: options.body || {},
      baseUrl: "/account/two-factor",
    };
    var res = {
      set: function () {},
      redirect: function (location) {
        resolve({ redirect: location });
      },
      message: function (location, message) {
        resolve({ saved: location, message: message });
      },
      render: function (view, locals) {
        resolve({ view: view, locals: locals, session: session });
      },
    };

    TwoFactor.handle(req, res, function (err) {
      if (err) return resolve({ error: err });
      reject(new Error("Two-factor route did not respond"));
    });
  });
}

describe("two-factor authentication route", function () {
  beforeEach(function () {
    spyOn(User, "checkPassword").and.callFake(function (uid, password, callback) {
      callback(null, password === "correct-password");
    });
  });

  it("redirects away from /enable when already enabled", async function () {
    var result = await request({
      url: "/enable",
      user: { uid: "u", email: "u@x.com", hasPassword: true, totpEnabled: true },
    });

    expect(result.redirect).toEqual("/account/two-factor");
  });

  it("redirects away from /enable when the account has no password set", async function () {
    var result = await request({
      url: "/enable",
      user: { uid: "u", email: "u@x.com", hasPassword: false, totpEnabled: false },
    });

    expect(result.redirect).toEqual("/sites/account/password/set");
  });

  it("rejects an incorrect password when starting setup", async function () {
    var result = await request({
      method: "POST",
      url: "/enable",
      body: { password: "wrong-password" },
    });

    expect(result.error.message).toEqual("Your existing password is incorrect.");
  });

  it("stores a pending secret and renders the QR setup page on a correct password", async function () {
    var session = {};

    var result = await request({
      method: "POST",
      url: "/enable",
      body: { password: "correct-password" },
      session: session,
    });

    expect(result.view).toEqual("dashboard/account/two-factor-setup");
    expect(result.locals.secret).toEqual(jasmine.any(String));
    expect(result.locals.secret.length).toBeGreaterThan(0);
    expect(session.pendingTotpSetup.secret).toEqual(result.locals.secret);
    expect(session.pendingTotpSetup.createdAt).toEqual(jasmine.any(Number));
    expect(result.locals.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects an incorrect confirmation code", async function () {
    var result = await request({
      method: "POST",
      url: "/enable/confirm",
      session: {
        pendingTotpSetup: { secret: "AAAAAAAAAAAAAAAA", createdAt: Date.now() },
      },
      body: { code: "000000" },
    });

    expect(result.error).toEqual(jasmine.any(Error));
  });

  it("treats an expired pending setup as absent", async function () {
    var session = {
      pendingTotpSetup: {
        secret: "AAAAAAAAAAAAAAAA",
        createdAt: Date.now() - 11 * 60 * 1000,
      },
    };

    var result = await request({
      url: "/enable/confirm",
      session: session,
    });

    expect(result.redirect).toEqual("/account/two-factor/enable");
    expect(session.pendingTotpSetup).toBeUndefined();
  });

  it("clears the pending setup secret on cancel", async function () {
    var session = {
      pendingTotpSetup: { secret: "AAAAAAAAAAAAAAAA", createdAt: Date.now() },
    };

    var result = await request({
      url: "/enable/cancel",
      session: session,
    });

    expect(result.redirect).toEqual("/account/two-factor");
    expect(session.pendingTotpSetup).toBeUndefined();
  });

  it("enables two-factor and shows backup codes on a correct confirmation code", async function () {
    var otplib = require("otplib");
    var secret = "AAAAAAAAAAAAAAAA";

    spyOn(User, "enableTotp").and.callFake(function (uid, secret, callback) {
      callback(null, ["code-1", "code-2"]);
    });

    var result = await request({
      method: "POST",
      url: "/enable/confirm",
      session: { pendingTotpSetup: { secret: secret, createdAt: Date.now() } },
      body: { code: otplib.authenticator.generate(secret) },
    });

    expect(User.enableTotp).toHaveBeenCalledWith(
      "two-factor-route-user",
      secret,
      jasmine.any(Function)
    );
    expect(result.view).toEqual("dashboard/account/two-factor-backup-codes");
    expect(result.locals.codes).toEqual(["code-1", "code-2"]);
    expect(result.session.pendingTotpSetup).toBeUndefined();
  });

  it("requires a password to disable two-factor authentication", async function () {
    spyOn(User, "disableTotp").and.callFake(function (uid, callback) {
      callback(null);
    });

    var result = await request({
      method: "POST",
      url: "/disable",
      user: { uid: "u", email: "u@x.com", hasPassword: true, totpEnabled: true },
      body: { password: "wrong-password" },
    });

    expect(result.error.message).toEqual("Your existing password is incorrect.");
    expect(User.disableTotp).not.toHaveBeenCalled();
  });

  it("disables two-factor authentication with the correct password", async function () {
    spyOn(User, "disableTotp").and.callFake(function (uid, callback) {
      callback(null);
    });

    var result = await request({
      method: "POST",
      url: "/disable",
      user: { uid: "u", email: "u@x.com", hasPassword: true, totpEnabled: true },
      body: { password: "correct-password" },
    });

    expect(User.disableTotp).toHaveBeenCalledWith("u", jasmine.any(Function));
    expect(result.saved).toEqual("/account/two-factor");
  });
});
