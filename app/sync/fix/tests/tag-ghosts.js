describe("sync/fix/tag-ghosts", function () {
  var Tags = require("models/tags");
  var Entry = require("models/entry");
  var client = require("models/client-new");
  var fixTagGhosts = require("../tag-ghosts");

  it("propagates transaction rejections for empty-tag cleanup", function (done) {
    var execError = new Error("exec exploded");

    spyOn(Tags, "list").and.callFake(function (_blogID, callback) {
      callback(null, [{ slug: "ghost-tag" }]);
    });
    spyOn(Tags, "get").and.callFake(function (_blogID, _slug, callback) {
      callback(null, []);
    });
    spyOn(Entry, "get");

    var multi = {
      sRem: jasmine.createSpy("sRem"),
      del: jasmine.createSpy("del"),
      exec: jasmine.createSpy("exec").and.callFake(function (callback) {
        callback(execError);
      }),
    };

    spyOn(client, "multi").and.returnValue(multi);

    fixTagGhosts({ id: "blog-id" }, function (err, report) {
      expect(err).toBe(execError);
      expect(report).toBeUndefined();
      expect(client.multi).toHaveBeenCalled();
      expect(multi.sRem).toHaveBeenCalled();
      expect(multi.del).toHaveBeenCalled();
      done();
    });
  });
});
