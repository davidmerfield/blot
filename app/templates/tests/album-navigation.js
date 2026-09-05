const fs = require("fs");
const path = require("path");

describe("album navigation", function () {
  const css = fs.readFileSync(
    path.join(__dirname, "../source/album/style.css"),
    "utf8"
  );
  const script = fs.readFileSync(
    path.join(__dirname, "../source/album/script.js"),
    "utf8"
  );

  it("hides the hamburger on desktop and shows it on small screens", function () {
    expect(css).toMatch(/#toggle\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(
      /@media screen and \(max-width: 500px\)\s*\{[\s\S]*#toggle\s*\{[\s\S]*display:\s*block/
    );
  });

  it("hides the infinite-scroll next-page hook", function () {
    expect(css).toMatch(
      /\{\{#infinite_scroll\}\}\s*a\.next-page\s*\{[\s\S]*display:\s*none/
    );
  });

  it("does not assume pagination nodes exist when updating history", function () {
    expect(script).toMatch(/getElementById\(['"]current-page['"]\)/);
    expect(script).toMatch(/if \(current\)/);
    expect(script).toMatch(/if \(previous\)/);
  });
});
