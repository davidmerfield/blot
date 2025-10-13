describe("entry error handling", function () {
  require("./setup")();

  it("propagates redis errors from get", function (done) {
    const client = require("models/client");
    const get = require("../get");
    const error = new Error("Redis mget failure");

    spyOn(client, "mget").and.callFake(function (keys, callback) {
      callback(error);
    });

    get(this.blog.id, "/missing", function (err) {
      expect(err).toBe(error);
      done();
    });
  });

  it("propagates redis errors from getByUrl", function (done) {
    const client = require("models/client");
    const getByUrl = require("../getByUrl");
    const error = new Error("Redis get failure");

    spyOn(client, "get").and.callFake(function (key, callback) {
      callback(error);
    });

    getByUrl(this.blog.id, "/missing", function (err) {
      expect(err).toBe(error);
      done();
    });
  });
});
