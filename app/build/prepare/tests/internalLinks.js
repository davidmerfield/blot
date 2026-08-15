describe("internalLinks", function () {
  var cheerio = require("cheerio");
  var internalLinks = require("../internalLinks");

  beforeEach(function () {
    this.internalLinks = function (html, dependencies) {
      var $ = cheerio.load(
        html,
        {
          decodeEntities: false,
          withDomLvl1: false // this may cause issues?
        },
        false
      );

      return internalLinks($, dependencies);
    };
  });

  it("keeps canonical internal links", function () {
    expect(this.internalLinks('<a href="/hey">Hey</a>')).toEqual(["/hey"]);
  });

  it("ignores external links", function () {
    expect(this.internalLinks('<a href="https://example.com/hey">Hey</a>')).toEqual([]);
  });

  it("normalizes fragments and query strings to the base path", function () {
    expect(
      this.internalLinks(
        '<a href="/target#section">Section</a><a href="/target?x=1">Query</a><a href="/target?x=1#section">Both</a>'
      )
    ).toEqual(["/target"]);
  });

  it("deduplicates across canonical and variant internal links", function () {
    expect(
      this.internalLinks(
        '<a href="/target">Base</a><a href="/target#x">Fragment</a><a href="/target?y=1">Query</a>'
      )
    ).toEqual(["/target"]);
  });

  it("excludes hrefs already known to be resolved file dependencies", function () {
    // A relative link to a local file resolves to an absolute path,
    // e.g. beach.jpg -> /Photos/beach.jpg. If that path happens to
    // collide with another entry's custom permalink, it must not be
    // mistaken for a link to that entry.
    expect(
      this.internalLinks(
        '<a href="/Photos/beach.jpg">Beach</a><a href="/some-post">Some post</a>',
        ["/Photos/beach.jpg"]
      )
    ).toEqual(["/some-post"]);
  });

  it("keeps all internal links when no dependencies are given", function () {
    expect(this.internalLinks('<a href="/hey">Hey</a>')).toEqual(["/hey"]);
  });
});
