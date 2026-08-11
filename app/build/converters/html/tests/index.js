const build = require("../../../index");
const fs = require("fs-extra");
const path = require("path");

describe("html converter metadata", function () {
  global.test.blog();

  ["bare-metadata.html", "yaml-metadata.html"].forEach(function (fixture) {
    it("preserves metadata before converting " + fixture, function (done) {
      const entryPath = "/" + fixture;
      const source = path.join(__dirname, "fixtures", fixture);

      fs.copySync(source, this.blogDirectory + entryPath);

      build(this.blog, entryPath, function (err, entry) {
        if (err) return done.fail(err);

        expect(entry.metadata.Title).toBe("Rock & Roll");
        expect(entry.metadata.Custom).toBe("1 < 2 &copy; 3 > 2");
        expect(entry.slug).toBe("rock-roll");

        expect(entry.html).not.toContain("Title: Rock");
        expect(entry.html).not.toContain("Custom:");
        expect(entry.html).not.toContain("---");
        expect(entry.html).toContain(
          '<div class="body">Body &amp; entity<br></div>'
        );
        done();
      });
    });
  });
});
