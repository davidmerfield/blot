const Entries = require("models/entries");
const retrieveEntries = require("../render/retrieve/entries");

describe("retrieve entries", function () {
  it("passes template locals and params to entries.getPage", function (done) {
    const getPageSpy = spyOn(Entries, "getPage").and.callFake(
      (blogID, options, callback) => {
        callback(null, ["first", "second"], { current: 3 });
      }
    );

    const req = {
      blog: { id: "blog-id" },
      template: { locals: { sort_by: "date", sort_order: "asc", page_size: 10 } },
      params: { page: 3 },
      log: function () {},
    };

    const res = { locals: {} };

    retrieveEntries(req, res, function (err, locals) {
      expect(err).toBeFalsy();
      expect(getPageSpy).toHaveBeenCalledWith(
        "blog-id",
        { sortBy: "date", order: "asc", pageNumber: 3, pageSize: 10 },
        jasmine.any(Function)
      );
      expect(locals).toEqual(["first", "second"]);
      expect(res.locals.entries).toEqual(["first", "second"]);
      expect(res.locals.pagination).toEqual({ current: 3 });
      done();
    });
  });

  it("uses query page when route params are missing", function (done) {
    const getPageSpy = spyOn(Entries, "getPage").and.callFake(
      (blogID, options, callback) => {
        callback(null, [], { current: 7 });
      }
    );

    const req = {
      blog: { id: "blog-id" },
      template: { locals: {} },
      query: { page: 7 },
      log: function () {},
    };

    const res = { locals: {} };

    retrieveEntries(req, res, function (err, locals) {
      expect(err).toBeFalsy();
      expect(getPageSpy).toHaveBeenCalledWith(
        "blog-id",
        { sortBy: undefined, order: undefined, pageNumber: 7, pageSize: undefined },
        jasmine.any(Function)
      );
      expect(locals).toEqual([]);
      expect(res.locals.entries).toEqual([]);
      expect(res.locals.pagination).toEqual({ current: 7 });
      done();
    });
  });
});
