const fs = require("fs");
const path = require("path");

describe("links template header", function () {
  const source = path.join(__dirname, "../source/links");
  const header = fs.readFileSync(path.join(source, "_header.html"), "utf8");
  const indexLink = fs.readFileSync(
    path.join(source, "_index_link.html"),
    "utf8"
  );
  const css = fs.readFileSync(path.join(source, "style.css"), "utf8");
  const script = fs.readFileSync(path.join(source, "script.js"), "utf8");

  it("does not pin the search field at 42rem so nav labels can fit", function () {
    expect(header).not.toMatch(/flex-shrink:\s*0/);
    expect(header).not.toMatch(/flex-basis:\s*42rem/);
    expect(css).toMatch(/\.header \.search\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.header \.search\s*\{[^}]*flex:\s*1 1 12rem/);
  });

  it("lets the title sit at content width instead of a 25% flex basis", function () {
    expect(indexLink).toMatch(/class="site-title"/);
    expect(indexLink).not.toMatch(/flex-basis:\s*25%/);
    expect(css).toMatch(/\.header \.site-title\s*\{[^}]*flex:\s*0 1 auto/);
  });

  it("hides the Search menu item against .nav, not the unused .menu class", function () {
    expect(css).toMatch(/\.nav a\[href="\/search"/);
    expect(css).toMatch(/\.nav a\[data-url="\/search"/);
    expect(css).toMatch(/\.nav a\[data-label="Search"/);
  });

  it("marks menu links with data-url and data-label for the search-hide rule", function () {
    expect(header).toMatch(/data-url="\{\{\{url\}\}\}"/);
    expect(header).toMatch(/data-label="\{\{label\}\}"/);
  });

  it("encodes search queries with the browser encodeURIComponent helper", function () {
    expect(script).toMatch(/encodeURIComponent\(/);
    expect(script).not.toMatch(/encode_uri_component\(/);
  });
});
