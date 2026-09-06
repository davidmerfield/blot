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

    beforeEach(function () {
      spyOn(Entries, "getRecent").and.callFake((blogID, cb) => cb(newestFirst()));
    });

    it("keeps newest-first by default", async function () {
      expect(ids(await run(recentEntries, {}))).toEqual(["c.txt", "a.txt", "b.txt"]);
    });

    it("flips to oldest-first for date + desc", async function () {
      const value = await run(recentEntries, { sort_by: "date", sort_order: "desc" });
      expect(ids(value)).toEqual(["b.txt", "a.txt", "c.txt"]);
    });

    it("sorts by file path for id + asc", async function () {
      const value = await run(recentEntries, { sort_by: "id", sort_order: "asc" });
      expect(ids(value)).toEqual(["a.txt", "b.txt", "c.txt"]);
    });
  });

  describe("search_results", function () {
    const searchResults = require("../search_results");

    beforeEach(function () {
      spyOn(Entry, "search").and.callFake(function (blogID, query, options, cb) {
        if (typeof options === "function") cb = options;
        cb(null, newestFirst());
      });
    });

    it("keeps newest-first by default", async function () {
      expect(ids(await run(searchResults, {}))).toEqual(["c.txt", "a.txt", "b.txt"]);
    });

    it("sorts by file path Z-A for id + desc", async function () {
      const value = await run(searchResults, { sort_by: "id", sort_order: "desc" });
      expect(ids(value)).toEqual(["c.txt", "b.txt", "a.txt"]);
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
