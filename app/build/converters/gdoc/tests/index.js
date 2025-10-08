const gdoc = require("../index");
const fs = require("fs-extra");
const express = require("express");
const sharp = require("sharp");

describe("gdoc converter", function () {
  global.test.blog();

  beforeAll(function (done) {

    const app = express();

    app.get("/image.jpg", (req, res) => {
      sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer()
        .then((data) => {
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": data.length,
          });
          res.end(data);
        });
    });

    app.listen(7391, done);
  });

  const tests = fs
    .readdirSync(__dirname)
    .filter((i) => i.slice(-5) === ".gdoc");

  tests.forEach((name) => {
    it(`converts google doc with ${name}`, function (done) {
      const test = this;
      const path = `/${name}`;
      const expected = fs.readFileSync(`${__dirname + path}.html`, "utf8");

      let input = fs.readFileSync(__dirname + path, "utf8");

      // replace the image URLs in the input with the local test server
      // e.g. src="https://lh7-rt.googleusercontent.com/docsz/AD_4nXeOM3QajRFUH4o1uvULhy3HKKOGpPIi39yxJqyA5mUwvm9PCEz-ukcgLb0IQ_hePGn8OGUdlRrssCgWOe6-_4CNXNdjrq95OJpfoKZZWDWo3gW2ge1mdn5NzGGKL9H9pQ-pvdHEQCI?key=sopuY66csb8X0yGU9VCD5g"
      // -> src="http://localhost:7391/image.jpg"
      input = input.replace(
        /https:\/\/lh[0-9]+-rt\.googleusercontent\.com\/docsz\/[A-Za-z0-9_\-]+(\?key=[A-Za-z0-9_\-]+)/g,
        "http://localhost:7391/image.jpg"
      );

      fs.writeFileSync(test.blogDirectory + path, input, "utf8");

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
    const blogWithFlag = {
      ...test.blog,
      flags: { google_docs_preserve_linebreaks: false },
    };

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
