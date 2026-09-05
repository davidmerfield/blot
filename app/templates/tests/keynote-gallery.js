const fs = require("fs");
const path = require("path");

describe("keynote gallery homepage", function () {
  const css = fs.readFileSync(
    path.join(__dirname, "../source/keynote/style.css"),
    "utf8"
  );
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../source/keynote/package.json"),
      "utf8"
    )
  );
  const header = fs.readFileSync(
    path.join(__dirname, "../source/keynote/_header.html"),
    "utf8"
  );

  it("paints an opaque page background for screenshots", function () {
    expect(pkg.locals.background_color).toMatch(/^#/);
    expect(css).toMatch(/html\s*,\s*body\s*\{[^}]*background:\s*\{\{background_color\}\}/);
  });

  it("lets the filmstrip fill the viewport below the header", function () {
    expect(css).toMatch(/body:has\(\.gallery\)\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.gallery\s*\{[^}]*flex:\s*1/);
    expect(css).not.toMatch(/\.gallery\s*\{[^}]*position:\s*absolute/);
  });

  it("keeps the site title in the header without a float", function () {
    expect(css).toMatch(/#header\s*\{[^}]*display:\s*flex/);
    expect(css).not.toMatch(/#title\s*\{[^}]*float:\s*right/);
    expect(header).toMatch(/class="avatar"/);
  });
});
