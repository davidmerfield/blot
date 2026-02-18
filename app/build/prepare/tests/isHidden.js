describe("isHidden - isHidden", function () {
  var assert = require("assert");
  var isHidden = require("../isHidden");

  it("works", function () {
    expect(function () {
      function is(path, expected) {
        assert(isHidden(path) === expected);
      }

      is("/foo/-bar", false);
      is("/foo/b-a-r/baz", false);

      is("/foo/_bar/baz", true);
      is("/foo/_bar/b_az/_bar", true);
      is("_bar", true);
      is("/foo/.cache/baz", true);
    }).not.toThrow();
  });
});
