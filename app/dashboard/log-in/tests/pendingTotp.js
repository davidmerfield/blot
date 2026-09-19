var pendingTotp = require("../pendingTotp");

describe("log-in pendingTotp", function () {
  it("stores the uid, then, and a timestamp, and clears any existing session uid", function () {
    var req = { session: { uid: "already-logged-in" } };

    pendingTotp.set(req, "user_1", "/sites/somewhere");

    expect(req.session.uid).toBeUndefined();
    expect(req.session.pendingTotp.uid).toEqual("user_1");
    expect(req.session.pendingTotp.then).toEqual("/sites/somewhere");
    expect(req.session.pendingTotp.createdAt).toEqual(jasmine.any(Number));
  });

  it("returns null when nothing is pending", function () {
    var req = { session: {} };
    expect(pendingTotp.get(req)).toBeNull();
  });

  it("returns the pending challenge when still fresh", function () {
    var req = { session: {} };
    pendingTotp.set(req, "user_1", "/sites");

    expect(pendingTotp.get(req).uid).toEqual("user_1");
  });

  it("clears and returns null once the challenge has expired", function () {
    var req = { session: {} };
    pendingTotp.set(req, "user_1", "/sites");
    req.session.pendingTotp.createdAt = Date.now() - 11 * 60 * 1000;

    expect(pendingTotp.get(req)).toBeNull();
    expect(req.session.pendingTotp).toBeUndefined();
  });

  it("clear() removes the pending challenge", function () {
    var req = { session: {} };
    pendingTotp.set(req, "user_1", "/sites");

    pendingTotp.clear(req);

    expect(req.session.pendingTotp).toBeUndefined();
  });
});
