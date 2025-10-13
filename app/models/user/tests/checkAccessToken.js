describe("user.checkAccessToken", function () {
  const client = require("models/client");
  const checkAccessToken = require("../checkAccessToken");

  const originalGet = client.get;
  const originalDel = client.del;

  afterEach(function () {
    client.get = originalGet;
    client.del = originalDel;
  });

  it("returns redis get errors", function (done) {
    const error = new Error("Redis get failed");

    spyOn(client, "get").and.callFake(function (key, callback) {
      callback(error);
    });

    checkAccessToken("token", function (err) {
      expect(err).toBe(error);
      done();
    });
  });

  it("returns redis del errors", function (done) {
    const error = new Error("Redis del failed");

    spyOn(client, "get").and.callFake(function (key, callback) {
      callback(null, "value");
    });

    spyOn(client, "del").and.callFake(function (key, callback) {
      callback(error);
    });

    checkAccessToken("token", function (err) {
      expect(err).toBe(error);
      done();
    });
  });
});
