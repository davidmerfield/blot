const fs = require("fs");
const path = require("path");

describe("index template page background", function () {
  const css = fs.readFileSync(
    path.join(__dirname, "../source/index/style.css"),
    "utf8"
  );
  const search = fs.readFileSync(
    path.join(__dirname, "../source/index/search.html"),
    "utf8"
  );

  it("paints an opaque light canvas so gallery screenshots are not transparent", function () {
    expect(css).toMatch(/html\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/body\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*light/);
  });

  it("gives superscripts a valid font-size", function () {
    expect(css).toMatch(/sup\s*\{[^}]*font-size:\s*0\.83em/);
    expect(css).not.toMatch(/font-size:\s*0\.83;/);
  });

  it("targets the search field that search.html actually renders", function () {
    expect(search).toMatch(/<input[^>]*name="q"/);
    expect(css).toMatch(/input\[name=q\]:focus/);
    expect(css).not.toMatch(/input#search:focus/);
  });
});
