describe("title parser: permalink", function () {
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
});
