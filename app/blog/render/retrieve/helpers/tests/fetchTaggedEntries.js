describe("fetchTaggedEntries sort ordering", function () {
  const Tags = require("models/tags");
  const fetchTaggedEntries = require("../fetchTaggedEntries");

  // Tagged entry IDs arrive newest-first (Redis sorted set scored by dateStamp,
  // read with REV). Simulate four entries in that order.
  const NEWEST_FIRST = ["d.txt", "c.txt", "b.txt", "a.txt"];

  function stubTag(ids) {
    spyOn(Tags, "get").and.callFake(function (blogID, slug, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = undefined;
      }
      const list = ids.slice();
      const total = list.length;
      if (options && options.limit !== undefined) {
        const start = options.offset || 0;
        callback(null, list.slice(start, start + options.limit), slug, total);
      } else {
        callback(null, list, slug, total);
      }
    });
  }

  function run(options) {
    return new Promise(function (resolve, reject) {
      fetchTaggedEntries("blog-1", "foo", options, function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  it("keeps newest-first order for the default selection", async function () {
    stubTag(NEWEST_FIRST);
    const result = await run({ limit: 10, offset: 0 });
    expect(result.entryIDs).toEqual(NEWEST_FIRST);
  });

  it("reverses to oldest-first for date + desc", async function () {
    stubTag(NEWEST_FIRST);
    const result = await run({
      limit: 10,
      offset: 0,
      sortBy: "date",
      order: "desc",
    });
    expect(result.entryIDs).toEqual(["a.txt", "b.txt", "c.txt", "d.txt"]);
  });

  it("sorts by file path A to Z for id + asc", async function () {
    stubTag(NEWEST_FIRST);
    const result = await run({
      limit: 10,
      offset: 0,
      sortBy: "id",
      order: "asc",
    });
    expect(result.entryIDs).toEqual(["a.txt", "b.txt", "c.txt", "d.txt"]);
  });

  it("sorts by file path Z to A for id + desc", async function () {
    stubTag(NEWEST_FIRST);
    const result = await run({
      limit: 10,
      offset: 0,
      sortBy: "id",
      order: "desc",
    });
    expect(result.entryIDs).toEqual(["d.txt", "c.txt", "b.txt", "a.txt"]);
  });

  it("orders the full list before paginating for a non-default selection", async function () {
    stubTag(NEWEST_FIRST);
    // Page 2, one per page, sorted by file path A to Z -> second entry is b.txt.
    const result = await run({
      limit: 1,
      offset: 1,
      sortBy: "id",
      order: "asc",
    });
    expect(result.entryIDs).toEqual(["b.txt"]);
  });
});
