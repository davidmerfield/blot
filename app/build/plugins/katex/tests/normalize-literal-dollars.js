const cheerio = require("cheerio");
const { normalizeLiteralDollarMath } = require("../../../math/normalizeLiteralDollars");
const { render } = require("../index");

describe("literal dollar math normalization", function () {
  function normalizeAndRender(html, callback) {
    const $ = cheerio.load(html, { decodeEntities: false }, false);
    normalizeLiteralDollarMath($);
    render($, function (err) {
      if (err) return callback(err);
      callback(null, $.html());
    });
  }

  it("normalizes literal $$ before KaTeX rendering", function (done) {
    normalizeAndRender("<p>Inline $$a+b$$ math</p>", function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain('class="katex"');
      expect(html).not.toContain("$$a+b$$");
      done();
    });
  });

  it("leaves literal $$ untouched during the KaTeX render phase", function (done) {
    const $ = cheerio.load("<p>Inline $$a+b$$ math</p>", { decodeEntities: false }, false);

    render($, function (err) {
      if (err) return done.fail(err);
      const html = $.html();
      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$$a+b$$");
      done();
    });
  });
});
