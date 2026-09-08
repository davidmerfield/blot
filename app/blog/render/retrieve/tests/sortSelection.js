// The "Post sorting" control feeds every post listing. These specs stub the
// models and check each retrieve helper re-orders its results accordingly.
describe("post sorting across retrieve helpers", function () {
  const Entries = require("models/entries");
  const Entry = require("models/entry");

  // Newest-first, the order the models return by default.
  const newestFirst = () => [
    { id: "c.txt", dateStamp: 30 },
    { id: "a.txt", dateStamp: 20 },
    { id: "b.txt", dateStamp: 10 },
  ];

  const ids = (entries) => entries.map((entry) => entry.id);

  function run(helper, locals) {
    return new Promise((resolve, reject) => {
      helper(
        { blog: { id: "b1" }, query: { q: "x" }, params: {}, template: { locals } },
        { locals: {} },
        (err, value) => (err ? reject(err) : resolve(value))
      );
    });
  }

  describe("recent_entries (feeds)", function () {
    const recentEntries = require("../recent_entries");
    let received;

    beforeEach(function () {
      received = undefined;
      // getPage selects the page in the requested order; stub it to just
      // record the options and hand back a fixed list.
      spyOn(Entries, "getPage").and.callFake(function (blogID, options, cb) {
        received = options;
        cb(null, newestFirst());
      });
    });

    it("asks getPage for the first page in the default order", async function () {
      await run(recentEntries, {});
      expect(received.pageNumber).toBe(1);
      expect(received.pageSize).toBe(31);
      expect(received.sortBy).toBeUndefined();
      expect(received.order).toBeUndefined();
    });

    it("forwards oldest-first (date + desc) to getPage", async function () {
      await run(recentEntries, { sort_by: "date", sort_order: "desc" });
      expect(received.sortBy).toBe("date");
      expect(received.order).toBe("desc");
    });

    it("forwards file-path order to getPage", async function () {
      await run(recentEntries, { sort_by: "id", sort_order: "asc" });
      expect(received.sortBy).toBe("id");
      expect(received.order).toBe("asc");
    });
  });

  describe("search_results", function () {
    const searchResults = require("../search_results");
    let received;

    beforeEach(function () {
      received = undefined;
      spyOn(Entry, "search").and.callFake(function (blogID, query, options, cb) {
        if (typeof options === "function") {
          cb = options;
          options = undefined;
        }
        received = { blogID, query, options };
        // Entry.search returns already sorted + capped; the helper passes through.
        cb(null, newestFirst());
      });
    });

    it("forwards the resolved selection to Entry.search and passes results through", async function () {
      const value = await run(searchResults, { sort_by: "id", sort_order: "desc" });
      expect(received.options).toEqual({ sortBy: "id", order: "desc" });
      expect(ids(value)).toEqual(["c.txt", "a.txt", "b.txt"]);
    });

    it("forwards the default (undefined) selection", async function () {
      await run(searchResults, {});
      expect(received.options).toEqual({ sortBy: undefined, order: undefined });
    });

    it("returns [] when there is no query", function (done) {
      searchResults(
        { blog: { id: "b1" }, query: {}, template: { locals: {} } },
        { locals: {} },
        (err, value) => {
          expect(err).toBe(null);
          expect(value).toEqual([]);
          done();
        }
      );
    });
  });
});
