// The "Post sorting" control drives the index page, tag pages and search.
// Feeds / recent_entries deliberately stay newest-first. These specs stub the
// models and check each retrieve helper accordingly.
describe("post sorting across retrieve helpers", function () {
  const Entries = require("models/entries");

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

    it("stays newest-first regardless of the Post sorting selection", async function () {
      // Feeds and "Latest" widgets are recency snapshots; the control must not
      // touch them.
      for (const locals of [
        {},
        { sort_by: "date", sort_order: "desc" },
        { sort_by: "id", sort_order: "asc" },
      ]) {
        expect(ids(await run(recentEntries, locals))).toEqual([
          "c.txt",
          "a.txt",
          "b.txt",
        ]);
      }
    });
  });
});
