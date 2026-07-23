const cheerio = require("cheerio");
const {
  normalizeLiteralDollarMath,
  normalizeMathInText,
  tokenizeDollarMath,
} = require("../../../math/normalizeLiteralDollars");
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

  it("normalizes single-dollar inline math", function () {
    expect(normalizeMathInText("Inline $x$ math")).toBe(
      'Inline <span class="math inline">x</span> math'
    );
  });

  it("normalizes double-dollar math with existing inline/display semantics", function () {
    expect(normalizeMathInText("Inline $$x$$ math")).toBe(
      'Inline <span class="math inline">x</span> math'
    );
    expect(normalizeMathInText("$$x$$")).toBe(
      '<span class="math display">x</span>'
    );
  });

  it("normalizes adjacent single- and double-dollar math", function () {
    expect(normalizeMathInText("$x$ and $$y$$")).toBe(
      '<span class="math inline">x</span> and <span class="math inline">y</span>'
    );
  });

  it("leaves currency text literal", function () {
    expect(normalizeMathInText("Prices are $5 and $10 today")).toBe(
      "Prices are $5 and $10 today"
    );
  });

  it("leaves escaped dollars literal", function () {
    expect(normalizeMathInText("Escaped \\$x\\$ math")).toBe("Escaped \\$x\\$ math");
  });

  it("tokenizes escaped dollars as text", function () {
    expect(tokenizeDollarMath("Escaped \\$x\\$ math")).toEqual([
      { type: "text", value: "Escaped \\$x\\$ math" },
    ]);
  });

  it("tokenizes unmatched dollars as text", function () {
    expect(tokenizeDollarMath("Unmatched $x math")).toEqual([
      { type: "text", value: "Unmatched $x math" },
    ]);
  });

  it("tokenizes currency as text", function () {
    expect(tokenizeDollarMath("Prices are $5 and $10 today")).toEqual([
      { type: "text", value: "Prices are $5 and $10 today" },
    ]);
  });

  it("tokenizes adjacent delimiters", function () {
    expect(tokenizeDollarMath("$x$$$y$$")).toEqual([
      { type: "math", value: "x", display: false },
      { type: "math", value: "y", display: true },
    ]);
  });
});
