const fs = require("fs");
const path = require("path");
const mustache = require("mustache");

describe("magazine homepage layout", function () {
  const source = path.join(__dirname, "../source/magazine");
  const featured = fs.readFileSync(path.join(source, "_featured.html"), "utf8");
  const css = fs.readFileSync(path.join(source, "css-theme.css"), "utf8");
  const entries = fs.readFileSync(path.join(source, "entries.html"), "utf8");

  it("keeps the featured story as a two-column hero even without a summary", function () {
    expect(featured).toMatch(/w-two-thirds/);
    expect(featured).toMatch(/w-third/);
    expect(featured).toMatch(/max-height:23\.4375rem/);
    expect(featured).not.toMatch(/\{\{\^summary\}\}[\s\S]*w-100/);
  });

  it("renders a photo post into the two-column hero", function () {
    const html = mustache.render(featured, {
      url: "/wild-pansies",
      title: "Wild pansies at Brunneby",
      date: "September 5, 2026",
      dateStamp: 1,
      thumbnail: { large: { url: "/pansies.jpg" } },
      tags: [{ first: true, tag: "Östergötland" }],
    });

    expect(html).toMatch(/w-two-thirds/);
    expect(html).toMatch(/w-third/);
    expect(html).toMatch(/Wild pansies at Brunneby/);
    expect(html).toMatch(/pansies\.jpg/);
    expect(html).not.toMatch(/w-100/);
  });

  it("full-widths photo-post thumbnails on small screens", function () {
    const mobile = css.split("@media (max-width:500px)")[1] || "";
    expect(mobile).toMatch(/\.entry-line \.w-two-thirds/);
  });

  it("clips photo-post grid images so the index stays a list of stories", function () {
    const lines = fs.readFileSync(
      path.join(source, "entry_line.html"),
      "utf8"
    );
    expect(lines).toMatch(/\{\{\^summary\}\}[\s\S]*max-height:14rem/);
  });

  it("does not wrap the featured story in a flex container that fights the columns", function () {
    expect(entries).not.toMatch(/featured-entry"[^>]*display:flex/);
  });
});
