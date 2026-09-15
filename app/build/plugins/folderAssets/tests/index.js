const fs = require("fs-extra");
const config = require("config");
const build = require("build");
const plugins = require("build/plugins");
const templates = require("templates");

beforeAll(function (done) {
  templates({ watch: false }, done);
}, 10 * 1000);

describe("folderAssets plugin", function () {
  require("build/tests/plugins/util/setup")();

  beforeEach(function () {
    this.blog.plugins.folderAssets = { enabled: true, options: {} };
  });

  it("rewrites folder file URLs to versioned CDN URLs", function (done) {
    fs.outputFileSync(this.blogDirectory + "/Docs/report.pdf", "fake pdf");
    fs.outputFileSync(
      this.blogDirectory + "/post.md",
      "[Download](/Docs/report.pdf)"
    );

    build(this.blog, "/post.md", (err, entry) => {
      if (err) return done.fail(err);
      expect(entry.html).toMatch(
        new RegExp(
          `${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/Docs/report.pdf`
        )
      );
      done();
    });
  });

  it("leaves images for the image-cache plugin", function (done) {
    fs.outputFileSync(this.blogDirectory + "/images/test.jpg", "fake image");
    fs.outputFileSync(
      this.blogDirectory + "/post.md",
      "![](/images/test.jpg)"
    );

    build(this.blog, "/post.md", (err, entry) => {
      if (err) return done.fail(err);
      expect(entry.html).not.toMatch(
        new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg`)
      );
      done();
    });
  });

  it("leaves external URLs, html links, and fragments untouched", function (done) {
    const html =
      '<p><a href="https://example.com/file.pdf">ext</a> <a href="/about.html">about</a> <a href="#section">section</a></p>';
    fs.outputFileSync(this.blogDirectory + "/post.md", html);

    build(this.blog, "/post.md", (err, entry) => {
      if (err) return done.fail(err);
      expect(entry.html).toContain('href="https://example.com/file.pdf"');
      expect(entry.html).toContain('href="/about.html"');
      expect(entry.html).toContain('href="#section"');
      done();
    });
  });

  it("leaves folder file URLs untouched when disabled", function (done) {
    this.blog.plugins.folderAssets = { enabled: false, options: {} };
    fs.outputFileSync(this.blogDirectory + "/Docs/report.pdf", "fake pdf");
    fs.outputFileSync(
      this.blogDirectory + "/post.md",
      "[Download](/Docs/report.pdf)"
    );

    build(this.blog, "/post.md", (err, entry) => {
      if (err) return done.fail(err);
      expect(entry.html).toContain('href="/Docs/report.pdf"');
      expect(entry.html).not.toContain(config.cdn.origin + "/folder/");
      done();
    });
  });

  it("runs for HTML source files", function (done) {
    fs.outputFileSync(this.blogDirectory + "/file.pdf", "pdf");
    fs.outputFileSync(
      this.blogDirectory + "/page.html",
      '<a href="/file.pdf">Download</a>'
    );

    build(this.blog, "/page.html", (err, entry) => {
      if (err) return done.fail(err);
      expect(entry.html).toMatch(
        new RegExp(
          `${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/file.pdf`
        )
      );
      done();
    });
  });

  it("is enabled by default", function () {
    expect(plugins.defaultList.folderAssets.enabled).toBe(true);
  });
});
