const fs = require("fs");
const path = require("path");

describe("hypertext template", function () {
  const source = path.join(__dirname, "../source/hypertext");
  const css = fs.readFileSync(path.join(source, "style.css"), "utf8");
  const navJs = fs.readFileSync(path.join(source, "navigation-js.js"), "utf8");
  const scriptJs = fs.readFileSync(path.join(source, "script.js"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(source, "package.json"), "utf8")
  );

  it("does not break words at arbitrary points", function () {
    expect(css).toMatch(/overflow-wrap:\s*break-word/);
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("keeps authored image widths instead of forcing width: auto", function () {
    const imgRule = css.match(/\.entry img\s*\{[^}]+\}/);
    expect(imgRule).not.toBeNull();
    expect(imgRule[0]).not.toMatch(/width:\s*auto/);
  });

  it("sorts root pages before folders so they are not nested under the last directory", function () {
    expect(navJs).toMatch(
      /ul === this\.root \? \[\.\.\.files, \.\.\.folders\] : \[\.\.\.folders, \.\.\.files\]/
    );
  });

  it("lets the browser handle feed and file links instead of loading them into main", function () {
    expect(scriptJs).toMatch(/function isDocumentNavigation/);
    expect(scriptJs).toMatch(/\.\(rss\|xml\|atom/);
    expect(scriptJs).toMatch(
      /isInternal\(link\) && isDocumentNavigation\(link\)/
    );
  });

  it("uses posts in the entries index title partial", function () {
    const title = packageJson.views["entries.html"].partials.title;
    expect(title).toMatch(/\{\{#posts\}\}/);
    expect(title).not.toMatch(/\{\{#entries\}\}/);
  });
});
