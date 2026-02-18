describe("formJSON  - tempDir", function () {
  var tempDir = require("../tempDir");
  var fs = require("fs-extra");

  it("works", function () {
    tempDir(__dirname, function (err, isInTempDir) {
      expect(isInTempDir).toEqual(false);
    });
  });

  it("works also", function () {
    tempDir(__dirname + "/foo.jpg", function (err, isInTempDir) {
      expect(isInTempDir).toEqual(undefined);
    });
  });

  it("checks a valid dir", function (done) {
    var validDir = tempDir() + "foo";

    fs.mkdir(validDir, function (err) {
      if (err) return done.fail(err);

      tempDir(validDir, function (err, isInTempDir) {
        if (err) return done.fail(err);

        expect(isInTempDir).toEqual(true);

        fs.rmdir(validDir, function (err) {
          if (err) return done.fail(err);
          done();
        });
      });
    });
  });
});
