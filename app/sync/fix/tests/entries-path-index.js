describe("sync/fix/entries-path-index", function () {
  var client = require("models/client");
  var pathIndex = require("models/entries/pathIndex");
  var fixEntriesPathIndex = require("../entries-path-index");

  it("does nothing when entry count and path index count match", function (done) {
    var exec = jasmine.createSpy("exec").and.callFake(function (callback) {
      callback(null, ["2", "2"]);
    });

    var batch = {
      zcard: jasmine.createSpy("zcard").and.returnValue(this),
      exec: exec,
    };

    batch.zcard.and.callFake(function () {
      return batch;
    });

    spyOn(client, "batch").and.returnValue(batch);
    spyOn(pathIndex, "backfillIndex");

    fixEntriesPathIndex({ id: "blog-id" }, function (err, changes) {
      expect(err).toBeNull();
      expect(changes).toEqual([]);
      expect(batch.zcard.calls.count()).toBe(2);
      expect(pathIndex.backfillIndex).not.toHaveBeenCalled();
      done();
    });
  });

  it("backfills the index when counts do not match", function (done) {
    var exec = jasmine.createSpy("exec").and.callFake(function (callback) {
      callback(null, ["5", "3"]);
    });

    var batch = {
      zcard: jasmine.createSpy("zcard").and.returnValue(this),
      exec: exec,
    };

    batch.zcard.and.callFake(function () {
      return batch;
    });

    spyOn(client, "batch").and.returnValue(batch);
    spyOn(pathIndex, "backfillIndex").and.callFake(function (blogID, callback) {
      expect(blogID).toBe("blog-id");
      callback(null, 5);
    });

    fixEntriesPathIndex({ id: "blog-id" }, function (err, changes) {
      expect(err).toBeNull();
      expect(changes).toEqual([
        ["MISMATCH", { entries: 5, pathIndex: 3 }],
        ["BACKFILLED", 5],
      ]);
      expect(pathIndex.backfillIndex).toHaveBeenCalled();
      done();
    });
  });

  it("returns errors from the initial redis query", function (done) {
    var redisError = new Error("redis exploded");

    var batch = {
      zcard: jasmine.createSpy("zcard").and.returnValue(this),
      exec: jasmine.createSpy("exec").and.callFake(function (callback) {
        callback(redisError);
      }),
    };

    batch.zcard.and.callFake(function () {
      return batch;
    });

    spyOn(client, "batch").and.returnValue(batch);
    spyOn(pathIndex, "backfillIndex");

    fixEntriesPathIndex({ id: "blog-id" }, function (err, changes) {
      expect(err).toBe(redisError);
      expect(changes).toBeUndefined();
      expect(pathIndex.backfillIndex).not.toHaveBeenCalled();
      done();
    });
  });
});
