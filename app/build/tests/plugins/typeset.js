const build = require("build");
const fs = require("fs-extra");

describe("typeset plugin", function () {
  require("./util/setup")();

  it("treats string false values as disabled for punctuation and small caps", function (done) {
    const path = "/typeset-disabled.txt";
    const contents = 'He said "Hello" -- and NASA.';

    this.blog.plugins.typeset = {
      enabled: true,
      options: {
        punctuation: "off",
        smallCaps: "false",
      },
    };

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      expect(err).toBeNull();
      expect(entry.html).toContain('" -- and NASA.');
      expect(entry.html).not.toContain('<span class="small-caps">');
      expect(entry.html).not.toContain("“");
      expect(entry.html).not.toContain("—");
      expect(entry.html).not.toContain("&mdash;");
      done();
    });
  });

  it("treats string true values as enabled for punctuation and small caps", function (done) {
    const path = "/typeset-enabled.txt";
    const contents = 'He said "Hello" -- and NASA.';

    this.blog.plugins.typeset = {
      enabled: "true",
      options: {
        punctuation: "on",
        smallCaps: "1",
      },
    };

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      expect(err).toBeNull();
      expect(entry.html).toContain('<span class="small-caps">NASA</span>');
      expect(entry.html).toContain("“");
      expect(/&mdash;|—/.test(entry.html)).toBeTrue();
      done();
    });
  });
});
