describe("index-inputs sort control", function () {
  const indexInputs = require("../load/index-inputs");
  const SORT_OPTIONS = require("../sort-options");

  function load(locals) {
    const req = { template: { locals: locals || {} } };
    const res = { locals: {} };
    const next = jasmine.createSpy("next");

    indexInputs(req, res, next);

    expect(next).toHaveBeenCalledWith();
    return res.locals.index_page;
  }

  function sortControl(inputs) {
    return inputs.find(input => input.key === "sort_by" && input.label === "Post sorting");
  }

  it("always appends a combined post-sorting select", function () {
    const inputs = load({ page_size: 10 });
    const control = sortControl(inputs);

    expect(control).toBeDefined();
    expect(control.isSelect).toBe(true);
    expect(control.options.map(option => option.value)).toEqual(
      SORT_OPTIONS.map(option => option.value)
    );
    expect(control.options.filter(option => option.selected === "selected").length).toBe(1);
  });

  it("defaults to newest-first date sorting", function () {
    const control = sortControl(load({}));
    const selected = control.options.find(option => option.selected === "selected");

    expect(selected.value).toBe("date_asc");
    expect(selected.label).toBe("Publish date - Newest first");
  });

  it("selects file-path sorting from flat locals", function () {
    const control = sortControl(load({ sort_by: "id", sort_order: "asc" }));
    const selected = control.options.find(option => option.selected === "selected");

    expect(selected.value).toBe("id_asc");
    expect(selected.label).toBe("File path - A to Z");
  });

  it("selects nested sort config over flat locals", function () {
    const control = sortControl(
      load({
        sort: { by: "id", direction: "desc" },
        sort_by: "date",
        sort_order: "asc"
      })
    );
    const selected = control.options.find(option => option.selected === "selected");

    expect(selected.value).toBe("id_desc");
  });

  it("does not also render raw sort_by or sort_order selects", function () {
    const inputs = load({
      page_size: 12,
      sort_by: "id",
      sort_by_options: ["id", "date"],
      sort_order: "asc",
      sort_order_options: ["asc", "desc"]
    });

    expect(inputs.filter(input => input.key === "sort_by").length).toBe(1);
    expect(inputs.some(input => input.key === "sort_order")).toBe(false);
    expect(sortControl(inputs).options.find(option => option.selected === "selected").value).toBe(
      "id_asc"
    );
  });
});
