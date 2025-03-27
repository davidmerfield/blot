describe("dependencies", function () {
  var build = require("../index");
  var fs = require("fs-extra");

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

  it("ignores URLs", function (done) {
    var path = "/Hello.txt";
    var contents = "![Image](//example.com/_foo.jpg)";

    fs.outputFileSync(this.blogDirectory + path, contents);

    build(this.blog, path, function (err, entry) {
      if (err) return done.fail(err);

      expect(entry.dependencies).toEqual([]);
      done();
    });
  });
});
