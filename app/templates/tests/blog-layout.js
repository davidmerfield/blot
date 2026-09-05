const fs = require("fs");
const path = require("path");

describe("blog template layout", function () {
  const plugin = fs.readFileSync(
    path.join(__dirname, "../source/blog/plugin.css"),
    "utf8"
  );
  const css = fs.readFileSync(
    path.join(__dirname, "../source/blog/style.css"),
    "utf8"
  );
  const entries = fs.readFileSync(
    path.join(__dirname, "../source/blog/entries.html"),
    "utf8"
  );
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../source/blog/package.json"),
      "utf8"
    )
  );

  it("sizes four-column figures on desktop", function () {
    expect(plugin).toMatch(/\.column\.four\s*\{[^}]*width:\s*25%/);
  });

  it("clears floated columns so following copy does not wrap beside them", function () {
    expect(plugin).toMatch(/\.clear\s*\{[^}]*clear:\s*both/);
  });

  it("paginates the homepage", function () {
    expect(entries).toMatch(/\{\{#pagination\}\}/);
    expect(entries).toMatch(/href="\/page\/\{\{next\}\}"/);
  });

  it("keeps the mark between posts from pushing the next title off a gallery frame", function () {
    expect(css).toMatch(/hr\.full\s*\{[^}]*margin:\s*3\.5em 0 4\.5em/);
  });

  it("previews on a dedicated notes folder instead of the shared david kitchen-sink", function () {
    expect(pkg.locals.demo_folder).toEqual("notes");
  });
});
