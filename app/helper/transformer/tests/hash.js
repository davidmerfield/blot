describe("transformer hash helper", function () {
  var fs = require("fs-extra");
  var crypto = require("crypto");
  var HashFile = require("../hash");

  require("./setup")({});

  function expectedHash(path) {
    var contents = fs.readFileSync(path);
    return crypto.createHash("sha1").update(contents).digest("hex");
  }

  it("computes a SHA-1 digest with a callback", function (done) {
    var expected = expectedHash(this.localPath);

    HashFile(this.localPath, function (err, hash) {
      if (err) return done.fail(err);

      expect(hash).toEqual(expected);
      done();
    });
  });

  it("computes a SHA-1 digest when used as a promise", function () {
    var expected = expectedHash(this.localPath);

    return HashFile(this.localPath).then(function (hash) {
      expect(hash).toEqual(expected);
    });
  });
});
