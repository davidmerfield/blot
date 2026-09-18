const loosenDisplayMath = require("../loosenDisplayMath");
const SENTINEL = require("../hardBreakSentinel");

describe("loosenDisplayMath", function () {
  it("adds hard breaks around a multi-line $$ block glued to prose by single newlines", function () {
    const input =
      "the hamilton equations:\n$$\nx = y\n$$\nwhich determine the time evolution.";

    expect(loosenDisplayMath(input)).toBe(
      "the hamilton equations:" +
        SENTINEL +
        "\\\n$$\nx = y\n$$\\\n" +
        SENTINEL +
        "which determine the time evolution."
    );
  });

  it("adds hard breaks around a single-line $$...$$ glued to prose by single newlines", function () {
    const input =
      "the hamilton equations:\n$$x = y$$\nwhich determine the time evolution.";

    expect(loosenDisplayMath(input)).toBe(
      "the hamilton equations:" +
        SENTINEL +
        "\\\n$$x = y$$\\\n" +
        SENTINEL +
        "which determine the time evolution."
    );
  });

  it("leaves math that shares its line with other prose alone", function () {
    const input =
      "the hamilton equations: $$x = y$$ which determine the time evolution.";

    expect(loosenDisplayMath(input)).toBe(input);
  });

  it("leaves math that is already its own paragraph alone", function () {
    const input = "before\n\n$$\nx = y\n$$\n\nafter";

    expect(loosenDisplayMath(input)).toBe(input);
  });

  it("only adds the break on the side that's actually glued to prose", function () {
    const input = "before\n\n$$\nx = y\n$$\nafter";

    expect(loosenDisplayMath(input)).toBe(
      "before\n\n$$\nx = y\n$$\\\n" + SENTINEL + "after"
    );
  });

  it("does not touch dollars inside fenced code blocks", function () {
    const input = "text\n```\n$$\nx = y\n$$\n```\nmore text";

    expect(loosenDisplayMath(input)).toBe(input);
  });

  it("does not double-add a hard break", function () {
    const once = loosenDisplayMath(
      "the hamilton equations:\n$$\nx = y\n$$\nwhich determine the time evolution."
    );

    expect(loosenDisplayMath(once)).toBe(once);
  });
});
