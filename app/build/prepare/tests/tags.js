describe("isHidden - tags", function () {
  var assert = require("assert");
  var extractTags = require("../tags");

  it("works", function () {
    expect(function () {
      function is(filePath, expected, opener, closer) {
        try {
          assert.deepEqual(extractTags(filePath, opener, closer), expected);
        } catch (e) {
          console.log("------ input ------");
          console.log(filePath);
          console.log("----- became ------");
          console.log(extractTags(filePath, opener, closer));
          console.log("---- instead of ---");
          console.log(expected);
          throw "";
        }
      }

      // is('/{foo}/{bar}}', ['foo', 'bar'], '{', '}');

      is("", []);
      is("/", []);
      is("/foo/bar/baz", []);
      is("[a]", ["a"]);
      is("[foo]", ["foo"]);
      is("[foo]/bar/baz", ["foo"]);
      is("/[foo]/bar/baz", ["foo"]);
      is("/[foo] [bar]/bar/baz", ["foo", "bar"]);
      is("/[foo]/[bar]/[baz]", ["foo", "bar", "baz"]);
      is("/[foo] [bar]/[bar] [baz]/[bat] [bam", ["foo", "bar", "baz", "bat"]);
      is("/[Foo] [bar Man]/[count /[bAt]", ["Foo", "bar Man", "bAt"]);

      // Custom closers
      // is('/{{foo}}/{{bar}}', ['foo', 'bar'], '{{', '}}');
      // is('/--foo--/{{bar}}', ['foo'], '--', '--');
    }).not.toThrow();
  });
});
