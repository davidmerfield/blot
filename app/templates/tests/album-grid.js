const fs = require("fs");
const path = require("path");

describe("album index grid", function () {
  const square = fs.readFileSync(
    path.join(__dirname, "../source/album/_grid_square.html"),
    "utf8"
  );
  const bookshelf = fs.readFileSync(
    path.join(__dirname, "../source/album/_grid_bookshelf.html"),
    "utf8"
  );

  it("does not reserve leftover caption space under thumbnails", function () {
    expect(square).not.toMatch(/\.thumbnail\s*\{[^}]*margin-bottom:\s*1\.3rem/);
    expect(bookshelf).not.toMatch(/\.thumbnail\s*\{[^}]*margin-bottom:\s*1\.3rem/);
    expect(square).not.toMatch(/\.post\s*\{[^}]*margin-bottom:\s*2rem/);
    expect(bookshelf).not.toMatch(/\.post\s*\{[^}]*margin-bottom:\s*2rem/);
  });

  it("uses a valid percentage for the medium 800px breakpoint", function () {
    expect(square).not.toMatch(/33\.3333%%/);
    expect(bookshelf).not.toMatch(/33\.3333%%/);
    expect(square).toMatch(
      /@media screen and \(min-width: 800px\) \{\.post \{width: 33\.3333%;\}\}/
    );
    expect(bookshelf).toMatch(
      /@media screen and \(min-width: 800px\) \{\.post \{width: 33\.3333%;\}\}/
    );
  });
});
