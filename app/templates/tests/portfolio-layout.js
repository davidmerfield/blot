const fs = require("fs");
const path = require("path");

describe("portfolio template layout", function () {
  const dir = path.join(__dirname, "../source/portfolio");
  const header = fs.readFileSync(path.join(dir, "_header.html"), "utf8");
  const footer = fs.readFileSync(path.join(dir, "_footer.html"), "utf8");
  const navigation = fs.readFileSync(path.join(dir, "_navigation.html"), "utf8");
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  const grid = fs.readFileSync(path.join(dir, "fitted-grid.html"), "utf8");
  const entry = fs.readFileSync(path.join(dir, "entry.html"), "utf8");
  const script = fs.readFileSync(path.join(dir, "script.js"), "utf8");

  it("starts in standards mode", function () {
    expect(header).toMatch(/^\s*<!DOCTYPE html>/i);
  });

  it("does not close an unopened wrapper in the footer", function () {
    expect(footer.trim()).toMatch(/^<script /);
    expect(footer).not.toMatch(/<\/div>/);
  });

  it("pins utility links to the bottom of the sidebar", function () {
    const sidebar = navigation.replace(/<label[\s\S]*?<\/label>/, "");
    expect(sidebar).not.toMatch(/<br>/);
    expect(css).toMatch(/\.navigation \.menu\s*\{[^}]*margin-top:\s*auto/);
  });

  it("sizes the sidebar to the viewport instead of overflowing it", function () {
    expect(css).toMatch(/top:\s*0;\s*bottom:\s*0;/);
    expect(css).toMatch(
      /@media screen and \(max-width: 800px\)[\s\S]*\.navigation-container\s*\{[^}]*bottom:\s*auto/
    );
    expect(css).toMatch(
      /body\.position-top \.navigation-container\s*\{[^}]*bottom:\s*auto/
    );
  });

  it("keeps the last row of the photo grid from stretching", function () {
    expect(css).toMatch(/\.posts::after\s*\{[^}]*flex-grow:\s*999999999/);
  });

  it("gives fitted-grid max sizes units and positions photos", function () {
    expect(grid).toMatch(/max-width:\{\{thumbnail\.large\.width\}\}px/);
    expect(grid).toMatch(/max-height:\{\{thumbnail\.large\.height\}\}px/);
    expect(css).toMatch(/\.post img\s*\{[^}]*left:\s*0/);
  });

  it("places previous on the left and next on the right", function () {
    const leftNav = entry.match(
      /<div class="nav">([\s\S]*?)<div class="contents">/
    )[1];
    const rightNav = entry.match(
      /<\/div>\s*<div class="nav">([\s\S]*?)<\/div>\s*<\/div>\s*\{\{> footer\}\}/
    )[1];

    expect(leftNav).toMatch(/entry\.previous/);
    expect(leftNav).not.toMatch(/entry\.next/);
    expect(rightNav).toMatch(/entry\.next/);
    expect(rightNav).not.toMatch(/entry\.previous/);
  });

  it("maps arrow keys to previous and next", function () {
    expect(entry).toMatch(/previousURL && e\.keyCode == '37'/);
    expect(entry).toMatch(/nextURL && e\.keyCode == '39'/);
  });

  it("stores pathnames instead of window.location in session history", function () {
    expect(script).toMatch(/localHistory\.push\(\{\s*pathname:\s*window\.location\.pathname/);
    expect(script).toMatch(/pathname !== window\.location\.pathname/);
  });

  it("does not reference undefined color locals", function () {
    expect(css).not.toMatch(/navigation_link_color|text_link_color|text_link_visited_color/);
    expect(css).toMatch(/color: \{\{text_color\}\}/);
    expect(css).toMatch(/color: \{\{accent_color\}\}/);
  });
});
