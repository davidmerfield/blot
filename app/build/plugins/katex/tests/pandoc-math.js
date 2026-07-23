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

  it("falls back to escaped inline TeX with inline delimiters", function (done) {
    const input =
      '<p>Inline <span class="math inline">\\frac{&lt;img src=x onerror=alert(1)&gt;</span> math</p>';

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain("$\\frac{&lt;img src=x onerror=alert(1)&gt;$");
      expect(html).not.toContain("<img");
      expect(html).not.toContain('class="math');
      done();
    });
  });

  it("falls back to escaped display TeX with display delimiters", function (done) {
    const input =
      '<p><span class="math display">\\frac{&lt;script&gt;alert(1)&lt;/script&gt;</span></p>';

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).toContain("$$\\frac{&lt;script&gt;alert(1)&lt;/script&gt;$$");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain('class="math');
      done();
    });
  });

  it("leaves user-authored math spans inside skipped tags untouched", function (done) {
    const input =
      '<pre><code><span class="math inline">a+b</span></code></pre>';

    renderHtml(input, function (err, html) {
      if (err) return done.fail(err);
      expect(html).not.toContain('class="katex"');
      expect(html).toContain('<span class="math inline">a+b</span>');
      done();
    });
  });
});
