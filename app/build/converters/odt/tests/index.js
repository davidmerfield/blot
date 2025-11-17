const odt = require("../index");
const fs = require("fs-extra");

describe("odt converter", function () {
  global.test.blog();

  const tests = fs.readdirSync(__dirname).filter((i) => i.slice(-4) === ".odt");

  tests.forEach((name) => {
    it("converts odt with " + name, function (done) {
      const test = this;
      const path = "/" + name;
      const expected = fs.readFileSync(__dirname + path + ".html", "utf8");

      fs.copySync(__dirname + path, test.blogDirectory + path);

      odt.read(test.blog, path, function (err, result) {
        if (err) return done.fail(err);
        expect(result).toEqual(expected);
        if (result !== expected) {
          fs.writeFileSync(__dirname + "/" + name + "result.html", result);
        }
        done();
      });
    });
  });
});
