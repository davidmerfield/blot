describe("setup", function () {
  var async = require("async");
  var config = require("config");
  var client = require("models/client-new");
  var setup = require("../setup");

  it("uses mSetNX object argument shape for SSL bootstrap keys", function (done) {
    spyOn(async, "series").and.callFake(function (tasks, callback) {
      tasks[2](callback);
    });

    spyOn(client, "mSetNX").and.returnValue(Promise.resolve(1));

    setup(function (err) {
      expect(err).toBeFalsy();
      expect(client.mSetNX).toHaveBeenCalledWith({
        ["domain:" + config.host]: "X",
        ["domain:www." + config.host]: "X",
      });
      done();
    });
  });

  it("swallows bootstrap write rejection and still calls callback", function (done) {
    spyOn(async, "series").and.callFake(function (tasks, callback) {
      tasks[2](callback);
    });

    spyOn(client, "mSetNX").and.returnValue(Promise.reject(new Error("boom")));

    setup(function (err) {
      expect(err).toBeFalsy();
      expect(client.mSetNX).toHaveBeenCalled();
      done();
    });
  });
});
