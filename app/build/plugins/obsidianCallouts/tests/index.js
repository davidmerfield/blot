const fs = require("fs-extra");
const build = require("build");
const plugins = require("build/plugins");
const templates = require("templates");

beforeAll(function (done) {
  templates({ watch: false }, done);
}, 10 * 1000);

describe("obsidianCallouts plugin integration", function () {
  require("build/tests/plugins/util/setup")();

  beforeEach(function () {
    this.blog.plugins.obsidianCallouts = { enabled: true, options: {} };
  });

  const dir = __dirname + "/examples";
  const supportedExtensions = [".txt", ".md", ".html", ".gdoc"];

  const isSupportedSourceFixture = (file) =>
    supportedExtensions.some((ext) => file.endsWith(ext)) &&
    !supportedExtensions.some((ext) => file.endsWith(`${ext}.html`)) &&
    !file.endsWith(".expected.html");

  fs.readdirSync(dir)
    .filter(isSupportedSourceFixture)
    .forEach((file) => {
      it("handles " + file.split("-").join(" "), function (done) {
        const path = "/" + file;
        const contents = fs.readFileSync(dir + path, "utf8");
        const expectedPath = dir + path + ".html";
        let expected;

        try {
          expected = fs.readFileSync(expectedPath, "utf8");
        } catch (e) {}

        if (file === "html-blockquote.html") {
          this.blog.plugins.typeset = {
            enabled: true,
            options: { smallCaps: true },
          };
        }

        fs.outputFileSync(this.blogDirectory + path, contents);

        build(this.blog, path, (err, entry) => {
          if (err) return done.fail(err);
          const html = entry.html;

          if (html !== expected) {
            fs.outputFileSync(expectedPath + ".expected.html", html);
          }

          expect(expected).toEqual(html);

          if (file === "markdown-callouts.md") {
            expect(html).toContain(
              '<details class="callout" data-callout="info" data-callout-original="info" data-callout-fold="+" open=""><summary class="callout-title">'
            );
            expect(html).toContain(
              '<details class="callout" data-callout="danger" data-callout-original="danger" data-callout-fold="-"><summary class="callout-title">'
            );
            expect(html).toContain(
              '<span class="callout-title-inner">Danger</span></summary><div class="callout-content"><p>Hidden content.</p></div></details>'
            );
          }

          done();
        });
      });
    });

  it("loads public CSS when enabled", function (done) {
    plugins.load("css", this.blog.plugins, function (err, css) {
      if (err) return done.fail(err);
      expect(css).toContain(".callout[data-callout]");
      expect(css).not.toContain(".callout {");
      expect(css).toContain('.callout[data-callout="warning"]');
      expect(css).toContain("data:image/svg+xml;base64");
      expect(css).toContain("details.callout[data-callout-fold][open]");
      expect(css).toContain("summary.callout-title::marker");
      expect(css).not.toContain(
        '.callout[data-callout-fold="-"] .callout-content { display: none; }'
      );
      done();
    });
  });
});
