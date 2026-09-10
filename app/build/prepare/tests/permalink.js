describe("title parser", function () {
  const Permalink = require("../permalink");

  global.test.blog();

  const DEFAULT_ENTRY = {
    path: "/[design]/bar.txt",
    name: "bar.txt",
    size: 123,
    html: "",
    updated: 123,
    draft: false,
    metadata: {},
  };

  it("generates a permalink from the entry's path", function () {
    const entry = {
      ...DEFAULT_ENTRY,
      path: "/[design]/bar.txt",
    };
    const format = "{{stem}}";
    const zone = this.blog.timeZone;

    const permalink = Permalink(zone, format, entry);

    expect(permalink).toEqual("/design/bar");
  });

  it("converts diacritics appropriately", function () {
    const zone = this.blog.timeZone;
    const format = "{{slug-without-diacritics}}";
    const entry = {
      ...DEFAULT_ENTRY,
      slug: "börþåß",
    };

    let permalink = Permalink(zone, format, entry);

    expect(permalink).toEqual("/boerthaass");
  });

  it("generates a permalink from the entry's path with square brackets", function () {
    const entry = {
      ...DEFAULT_ENTRY,
      path: "/[design]/bar.txt",
    };
    const zone = this.blog.timeZone;
    const format = "{{path-without-extension}}";

    const permalink = Permalink(zone, format, entry);

    expect(permalink).toEqual("/[design]/bar");
  });

  it("keeps extensionless path/name tokens intact for folder posts", function () {
    // A folder post ("/album+") is published at the extensionless path
    // "/album"; lastIndexOf(".") === -1 must not turn slice(0, -1) into
    // "/albu".
    const entry = {
      ...DEFAULT_ENTRY,
      path: "/album",
      name: "album",
    };
    const zone = this.blog.timeZone;

    expect(Permalink(zone, "{{path-without-extension}}", entry)).toEqual(
      "/album"
    );
    expect(Permalink(zone, "{{name-without-extension}}", entry)).toEqual(
      "/album"
    );
    expect(Permalink(zone, "{{stem}}", entry)).toEqual("/album");
  });
});
