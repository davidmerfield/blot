describe("getTemplateSortOptions", function () {
  const getTemplateSortOptions = require("../sortOptions");

  it("reads flat sort_by and sort_order locals", function () {
    expect(
      getTemplateSortOptions({ sort_by: "id", sort_order: "desc" })
    ).toEqual({ sortBy: "id", order: "desc" });
  });

  it("prefers nested sort.by and sort.direction", function () {
    expect(
      getTemplateSortOptions({
        sort: { by: "id", direction: "desc" },
        sort_by: "date",
        sort_order: "asc"
      })
    ).toEqual({ sortBy: "id", order: "desc" });
  });

  it("accepts nested sort.order as an alias for direction", function () {
    expect(getTemplateSortOptions({ sort: { by: "id", order: "asc" } })).toEqual(
      { sortBy: "id", order: "asc" }
    );
  });

  it("returns undefined fields when locals are missing", function () {
    expect(getTemplateSortOptions()).toEqual({
      sortBy: undefined,
      order: undefined
    });
    expect(getTemplateSortOptions({})).toEqual({
      sortBy: undefined,
      order: undefined
    });
  });
});
