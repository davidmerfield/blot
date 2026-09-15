const fs = require("fs");

describe("templates rebuild subscription", function () {
  it("listens for templates:rebuild in one place", function () {
    const source = fs.readFileSync(require.resolve("templates"), "utf8");
    const occurrences = source.split("templates:rebuild").length - 1;
    expect(occurrences).toBe(1);
    expect(source).toContain("if (options.watch)");
  });
});
