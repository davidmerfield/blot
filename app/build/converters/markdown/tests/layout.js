const layout = require("../layout");

describe("layout", function () {
  it("works", function () {
    expect(function () {
      var assert = require("assert");

      function testLayout(input, expected) {
        var output = layout(input);

        try {
          assert(output === expected);
        } catch (e) {
          console.log();
          console.log("INPUT:");
          console.log("-------------------------");
          console.log(input);

          console.log();
          console.log("OUTPUT:");
          console.log("-------------------------");
          console.log(output);

          console.log();
          console.log("EXPECTED:");
          console.log("-------------------------");
          console.log(expected);
          throw e;
        }
      }

      function m() {
        var args = Array.prototype.slice.call(arguments);

        return args.join("\n");
      }

      var ai = m(
        "{||} Hey",
        "A line",
        "{||||} This",
        "{||||} This is dope",
        "Another line"
      );

      var ao = m(
        '<div class="two column">',
        "Hey",
        "</div>",
        '<div class="clear"></div>',
        "A line",
        '<div class="four column">',
        "This",
        "</div>",
        '<div class="four column">',
        "This is dope",
        "</div>",
        '<div class="clear"></div>',
        "Another line"
      );

      testLayout(ai, ao);

      var bi = m("{<|} Hey", "A line", "{>|} This");

      var bo = m(
        "{<|} Hey",
        "A line",
        '<div class="left margin">',
        "This",
        "</div>"
      );

      testLayout(bi, bo);

      var ci = m(
        "A line we should ignore!",
        "{>|} First line",
        "     Another line.",
        "     And Another!",
        "Another line we should ignore",
        "{<>} Wide shit here!",
        "     more wide shit!",
        "         Indented wide shit that will not be preserved :(",
        "A final line to ignore."
      );

      var co = m(
        "A line we should ignore!",
        '<div class="left margin">',
        "First line",
        "Another line.",
        "And Another!",
        "</div>",
        "Another line we should ignore",
        '<div class="wide">',
        "Wide shit here!",
        "more wide shit!",
        "Indented wide shit that will not be preserved :(",
        "</div>",
        "A final line to ignore."
      );

      testLayout(ci, co);
    }).not.toThrow();
  });
});
