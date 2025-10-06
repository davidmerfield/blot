const gdoc = require("../index");
const fs = require("fs-extra");

describe("gdoc converter", function () {
  global.test.blog();

  const tests = fs
    .readdirSync(__dirname)
    .filter((i) => i.slice(-5) === ".gdoc");

  tests.forEach((name) => {
    it(`converts google doc with ${name}`, function (done) {
      const test = this;
      const path = `/${name}`;
      const expected = fs.readFileSync(`${__dirname + path}.html`, "utf8");

      fs.copySync(__dirname + path, test.blogDirectory + path);

      gdoc.read(test.blog, path, function (err, result) {
        if (err) return done.fail(err);
        expect(result).toEqual(expected);
        done();
      });
    });
  });

  it("respects the flag to not preserve line breaks", async function () {
    const name = "linebreak.gdoc";

    const test = this;
    const path = `/${name}`;
    const expected = await fs.readFile(
      `${__dirname + path}.google_docs_preserve_linebreaks.html`,
      "utf8"
    );

    // set the flag to 'false'
    const blogWithFlag = {...test.blog, flags: { google_docs_preserve_linebreaks: false } };

    fs.copySync(__dirname + path, test.blogDirectory + path);

    await new Promise((resolve, reject) => {
      gdoc.read(blogWithFlag, path, function (err, result) {
        if (err) return reject(err);
        expect(result).toEqual(expected);
        resolve();
      });
    });
  });
});
