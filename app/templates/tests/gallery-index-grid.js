const fs = require("fs");
const path = require("path");

describe("gallery index grid", function () {
  const source = path.join(__dirname, "../source/gallery");
  const css = fs.readFileSync(path.join(source, "style.css"), "utf8");
  const entries = fs.readFileSync(path.join(source, "entries.html"), "utf8");
  const item = fs.readFileSync(path.join(source, "_item.html"), "utf8");
  const entry = fs.readFileSync(path.join(source, "entry.html"), "utf8");

  it("lays the homepage out as a filling square grid", function () {
    expect(entries).toMatch(/class="grid"/);
    expect(css).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/
    );
    expect(css).toMatch(/\.entry\s*\{[^}]*aspect-ratio:\s*1/);
  });

  it("crops thumbnails to fill each tile", function () {
    expect(css).toMatch(/object-fit:\s*cover/);
    expect(item).toMatch(/thumbnail\.medium/);
  });

  it("does not leave unmatched wrappers on the entry page", function () {
    const extraCloses = (entry.match(/<\/div>/g) || []).length;
    const opens = (entry.match(/<div\b/g) || []).length;
    expect(extraCloses).toEqual(opens);
  });
});
