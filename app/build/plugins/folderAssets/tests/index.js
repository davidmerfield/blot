describe("folderAssets plugin", function () {
  var build = require("../../../index");
  var fs = require("fs-extra");
  var BLOT_CDN_TOKEN = require("blog/render/replaceFolderLinks/cdnToken");

  global.test.blog();

  var tokenRegex = (path) =>
    new RegExp(
      `${BLOT_CDN_TOKEN.replace(/%/g, "\\%")}/folder/v-[a-f0-9]{8}/[^"]*${path}`
    );

  it("bakes a relative folder link into a %%BLOT_CDN%%-prefixed, versioned URL at build time", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](photo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);
    fs.outputFileSync(this.blogDirectory + "/photo.jpg", "fake image data");

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.html).toMatch(tokenRegex("/photo\\.jpg"));
      done();
    });
  });

  it("leaves non-matching/ENOENT links untouched", function (done) {
    var path = "/Hello.txt";
    var contents = "[Missing](missing.pdf)";

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.html).toContain('href="/missing.pdf"');
      expect(entry.html).not.toContain(BLOT_CDN_TOKEN);
      done();
    });
  });

  it("leaves internal .html links untouched", function (done) {
    var path = "/Hello.txt";
    var contents = "[Other post](other.html)";

    fs.outputFileSync(this.blogDirectory + path, contents);
    fs.outputFileSync(this.blogDirectory + "/other.html", "<p>hi</p>");

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.html).toContain('href="/other.html"');
      expect(entry.html).not.toContain(BLOT_CDN_TOKEN);
      done();
    });
  });

  it("produces a new version when the dependency file's content changes", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](photo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);
    fs.outputFileSync(this.blogDirectory + "/photo.jpg", "version one");

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      var firstVersion = entry.html.match(/v-([a-f0-9]{8})/)[1];

      fs.outputFileSync(this.blogDirectory + "/photo.jpg", "version two");

      build(this.blog, path, function (err, entry2) {
        if (err) return done.fail(err);

        var secondVersion = entry2.html.match(/v-([a-f0-9]{8})/)[1];

        expect(secondVersion).not.toEqual(firstVersion);
        done();
      });
    }.bind(this));
  });

  it("produces the same version for identical content even if the file was rewritten", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](photo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);
    fs.outputFileSync(this.blogDirectory + "/photo.jpg", "same content");

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      var firstVersion = entry.html.match(/v-([a-f0-9]{8})/)[1];

      fs.outputFileSync(this.blogDirectory + "/photo.jpg", "same content");

      build(this.blog, path, function (err, entry2) {
        if (err) return done.fail(err);

        var secondVersion = entry2.html.match(/v-([a-f0-9]{8})/)[1];

        expect(secondVersion).toEqual(firstVersion);
        done();
      });
    }.bind(this));
  });

  it("leaves reserved global-static prefixes unbaked even if the blog folder has a same-named file", function (done) {
    var path = "/Hello.txt";
    var contents = "![Font icon](fonts/icon.png) ![Katex](/katex/x.png)";

    fs.outputFileSync(this.blogDirectory + path, contents);
    fs.outputFileSync(this.blogDirectory + "/fonts/icon.png", "blog file");
    fs.outputFileSync(this.blogDirectory + "/katex/x.png", "blog file");

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.html).toContain('src="/fonts/icon.png"');
      expect(entry.html).toContain('src="/katex/x.png"');
      expect(entry.html).not.toContain(BLOT_CDN_TOKEN);
      done();
    });
  });

  it("is not optional, so it runs for blogs without a stored folderAssets plugin entry", function () {
    var plugins = require("../../index");

    expect(plugins.list.folderAssets.optional).toBe(false);
  });
});
