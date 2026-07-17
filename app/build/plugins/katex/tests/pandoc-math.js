const cheerio = require("cheerio");
const { render } = require("../index");

describe("katex pandoc math spans", function () {
  function renderHtml(html, callback) {
    const $ = cheerio.load(html, { decodeEntities: false }, false);
    render($, function (err) {
      if (err) return callback(err);
      callback(null, $.html());
    });
  }

  it("renders span.math.inline without markdown emphasis tags", function (done) {
    const input =
      '<p>Inline <span class="math inline">a+b</span> math</p>';

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain('class="katex"');
      expect(html).not.toContain('class="math');
      expect(html).toContain(">a+b</annotation>");
      done();
    });
  });

  it("renders underscore-heavy display math without em tags", function (done) {
    const tex =
      "\\mathbf{v}_1^{\\text{cm}} = \\mathbf{v} - \\mathbf{v}_{\\text{cm}} = \\frac{\\mathbf{v}}{2}";
    const input = `<p><span class="math display">${tex}</span></p>`;

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain('class="katex-display"');
      expect(html).toContain('class="katex"');
      expect(html).not.toContain("<em>");
      expect(html).not.toContain('class="math');
      expect(html).toContain(tex);
      done();
    });
  });

  it("still renders literal $$ for non-pandoc html", function (done) {
    const input = "<p>Inline $$a+b$$ math</p>";

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain('class="katex"');
      expect(html).not.toContain("$$a+b$$");
      done();
    });
  });
});
