describe("internalLinks", function () {
  var cheerio = require("cheerio");
  var internalLinks = require("../internalLinks");

  beforeEach(function () {
    this.internalLinks = function (html) {
      var $ = cheerio.load(
        html,
        {
          decodeEntities: false,
          withDomLvl1: false // this may cause issues?
        },
        false
      );

      return internalLinks($);
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
});
