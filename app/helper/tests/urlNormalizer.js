describe("urlNormalizer", function () {
  const urlNormalizer = require("helper/urlNormalizer");
  const is = require("./util/is")(urlNormalizer);

  it("works", function () {
    is("", "");
    is("/", "/");
    is("//", "/");
    is("/fo/", "/fo");
    is("http://blot.im/foo/bar", "/foo/bar");
    is("/foo/bar/", "/foo/bar");
    is("foo/bar/", "/foo/bar");
    is("mailto:test@example.com", "");
  });
});
