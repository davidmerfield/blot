describe("nameFrom ", function () {
  var nameFrom = require("../nameFrom");

  function is(src, expected) {
    it("handles " + src, function () {
      expect(nameFrom(src)).toEqual(expected);
    });
  }

  is(
    "/foo0000000000000000000000000000000000000000.txt",
    "0000000000000000000000000000000.txt"
  );

  is("/foo.txt", "foo.txt");
  is("/foo/bar.txt", "bar.txt");
  is("bar.txt", "bar.txt");

  is("//google.com/bar.txt", "bar.txt");
  is("https://google.com/fOo-bAr.txt?baz=true&twit=false", "foo-bar.txt");
});
