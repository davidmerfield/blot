describe("dependencies", function () {
  var build = require("../index");
  var fs = require("fs-extra");
  var nock = require("nock");
  var sharp = require("sharp");

  global.test.blog();

  it("are extracted inside entry contents", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](_foo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.dependencies).toEqual(["/_foo.jpg"]);
      done();
    });
  });

  it("are extracted from entry metadata", function (done) {
    var path = "/Hello.txt";
    var contents = "Thumbnail: _bar.jpg";

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.dependencies).toEqual(["/_bar.jpg"]);
      done();
    });
  });

  afterEach(function () {
    nock.cleanAll();
  });

  it("ignores URLs", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](//example.com/_foo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);

    sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer()
      .then((buffer) => {
        // The image caching plugin expects a real JPEG payload to proceed.
        nock("http://example.com").get("/_foo.jpg").reply(200, buffer);

        build(this.blog, path, function (err, entry) {
          if (err) return done.fail(err);

          expect(entry.dependencies).toEqual([]);
          done();
        });
      })
      .catch(done.fail);
  });
});
