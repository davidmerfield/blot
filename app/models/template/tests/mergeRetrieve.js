describe("mergeRetrieve", function () {
  var mergeRetrieve = require("../util/mergeRetrieve");

  it("promotes boolean retrieve roots to objects when merging fields", function () {
    expect(
      mergeRetrieve(
        { allEntries: true },
        { allEntries: { fields: { title: true } } }
      )
    ).toEqual({
      allEntries: { fields: { title: true } },
    });
  });

  it("keeps an existing fields object when merging a boolean", function () {
    expect(
      mergeRetrieve(
        { allEntries: { fields: { title: true } } },
        { allEntries: true }
      )
    ).toEqual({
      allEntries: { fields: { title: true } },
    });
  });

  it("merges projected fields from two retrieve objects", function () {
    expect(
      mergeRetrieve(
        { allEntries: { fields: { title: true } } },
        { allEntries: { fields: { url: true } } }
      )
    ).toEqual({
      allEntries: { fields: { title: true, url: true } },
    });
  });

  it("unions cdn arrays", function () {
    expect(mergeRetrieve({ cdn: ["a.css"] }, { cdn: ["b.css"] })).toEqual({
      cdn: ["a.css", "b.css"],
    });
  });
});
