const docx = require("../index");
const fs = require("fs-extra");

describe("docx converter", function () {
  global.test.blog();

  const tests = fs
    .readdirSync(__dirname)
    .filter((i) => i.slice(-5) === ".docx");

  tests.forEach((name) => {
    it("converts docx with " + name, function (done) {
      const test = this;
      const path = "/" + name;
      const expected = fs.readFileSync(__dirname + path + ".html", "utf8");

      fs.copySync(__dirname + path, test.blogDirectory + path);

      docx.read(test.blog, path, function (err, result) {
        if (err) return done.fail(err);
        expect(result).toEqual(expected);
        done();
      });
    });
  });
});
