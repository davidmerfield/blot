describe("sync/fix/list-ghosts", function () {
  var Entry = require("models/entry");
  var Entries = require("models/entries");
  var client = require("models/client");
  var fixListGhosts = require("../list-ghosts");

  it("resolves missing entries without rejection and continues mismatch cleanup", function (done) {
    spyOn(Entries, "pruneMissing").and.callFake(function (_blogID, callback) {
      callback(null);
    });

    spyOn(client, "zRange").and.callFake(function (key) {
      if (key === "blog:blog-id:entries") {
        return Promise.resolve(["existing-id", "missing-id"]);
      }

      return Promise.resolve([]);
    });

    spyOn(client, "zRem").and.returnValue(Promise.resolve(1));

    spyOn(Entry, "get").and.callFake(function (_blogID, id, callback) {
      if (id === "existing-id") {
        return callback({ id: "moved-id", title: "Moved" });
      }

      if (id === "missing-id") {
        return callback(undefined);
      }

      return callback(undefined);
    });

    spyOn(Entry, "set").and.callFake(function (_blogID, id, entry, callback) {
      expect(id).toBe("moved-id");
      expect(entry.id).toBe("moved-id");
      callback(null);
    });

    fixListGhosts({ id: "blog-id" }, function (err, report) {
      expect(err).toBeNull();

      expect(Entry.get.calls.allArgs()).toEqual([
        ["blog-id", "existing-id", jasmine.any(Function)],
        ["blog-id", "missing-id", jasmine.any(Function)],
      ]);

      expect(client.zRem.calls.allArgs()).toEqual([
        ["blog:blog-id:entries", "existing-id"],
        ["blog:blog-id:entries", "missing-id"],
      ]);

      expect(Entry.set.calls.count()).toBe(1);
      expect(report).toEqual([
        ["entries", "MISMATCH", "existing-id"],
        ["entries", "MISMATCH", "missing-id"],
      ]);

      done();
    });
  });
});
