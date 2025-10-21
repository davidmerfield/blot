const fs = require("fs-extra");
const org = require("build/converters/org/index");

describe("org converter", function () {
  global.test.blog();
  const dir = __dirname + "/examples";

  fs.readdirSync(dir)
    .filter((file) => org.is(file))
    .forEach((file) => {
      it("handles " + file.slice(0, -4).split("-").join(" "), function (done) {
        // Copy the .bib and csl files to the root of the blog folder
        fs.copySync(dir, this.blogDirectory);

        const path = "/" + file;
        org.read(this.blog, path, function (err, html) {
          if (err) return done.fail(err);

          let expected;
          
          try {
            expected = fs.readFileSync(dir + path + ".html", "utf8");
          } catch (e) { }

          if (html !== expected)
            fs.outputFileSync(dir + path + ".expected.html", html);

          expect(expected).toEqual(html);
          done();
        });
      });
    });
});
