xdescribe("wordpress", function () {
  var fs = require("fs-extra");
  var tidy = require("../item/tidy");
  var convert_to_markdown = require("../item/convert_to_markdown");
  var testsFolder = __dirname + "/tidy";
  var tests = fs.readdirSync(testsFolder).filter(function (dir) {
    return fs.statSync(testsFolder + "/" + dir).isDirectory();
  });

  tests.forEach(function (label) {
    it("should " + label, function (done) {
      var html = fs.readFileSync(
        testsFolder + "/" + label + "/input.txt",
        "utf-8"
      );

      var expectedResult = fs.readFileSync(
        testsFolder + "/" + label + "/result.txt",
        "utf-8"
      );

      tidy({ html: html }, function (err, entry) {
        if (err) return done.fail(err);
        convert_to_markdown(entry, function (err, entry) {
          if (err) return done.fail(err);

          expect(entry.content).toEqual(expectedResult);
          done();
        });
      });
    });
  });
});
