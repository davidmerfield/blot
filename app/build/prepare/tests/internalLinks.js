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

  it("works", function () {
    expect(this.internalLinks('<a href="/hey">Hey</a>')).toEqual(["/hey"]);
  });
});
