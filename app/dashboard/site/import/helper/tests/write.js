var fs = require("fs-extra");
var os = require("os");
var path = require("path");
var determinePath = require("../determine_path");
var createWriter = require("../write").createWriter;

describe("import writer path allocation", function () {
  var output;

  beforeEach(function () {
    output = fs.mkdtempSync(path.join(os.tmpdir(), "import-writer-"));
  });

  afterEach(function () {
    fs.removeSync(output);
  });

  function writeAll(entries, done) {
    var determine = determinePath(output);
    var write = createWriter();
    var index = 0;

    function next(err) {
      if (err) return done.fail(err);
      if (index === entries.length) return done();
      var entry = entries[index++];
      entry.content = entry.content || "body";
      determine(entry, function (err) {
        if (err) return next(err);
        write(entry, next);
      });
    }

    next();
  }

  it("deduplicates titles which collide after punctuation normalization", function (done) {
    writeAll([{ title: "Hello!" }, { title: "Hello?" }], function () {
      expect(fs.existsSync(path.join(output, "Undated", "Hello.txt"))).toBe(true);
      expect(fs.existsSync(path.join(output, "Undated", "Hello-2.txt"))).toBe(true);
      done();
    });
  });

  it("deduplicates names which collide after 150-character truncation", function (done) {
    var prefix = "a".repeat(150);
    writeAll([{ title: prefix + "x" }, { title: prefix + "y" }], function () {
      expect(fs.existsSync(path.join(output, "Undated", prefix + ".txt"))).toBe(true);
      expect(fs.existsSync(path.join(output, "Undated", prefix.slice(0, 148) + "-2.txt"))).toBe(true);
      done();
    });
  });

  it("keeps suffixes visible within the filename limit", function (done) {
    var entries = [];
    for (var i = 0; i < 10; i++) entries.push({ title: "x".repeat(160) });
    writeAll(entries, function () {
      expect(fs.existsSync(path.join(output, "Undated", "x".repeat(147) + "-10.txt"))).toBe(true);
      done();
    });
  });

  it("allows identical names in different destination directories", function (done) {
    writeAll([{ title: "Same", page: true }, { title: "Same", draft: true }], function () {
      expect(fs.existsSync(path.join(output, "Pages", "Same.txt"))).toBe(true);
      expect(fs.existsSync(path.join(output, "Drafts", "Same.txt"))).toBe(true);
      done();
    });
  });

  it("moves staged assets beside the final post.txt", function (done) {
    var assets = fs.mkdtempSync(path.join(os.tmpdir(), "import-assets-"));
    fs.writeFileSync(path.join(assets, "_image.png"), "image");
    writeAll([{ title: "With asset", asset_directory: assets }], function () {
      var destination = path.join(output, "Undated", "With-asset");
      expect(fs.readFileSync(path.join(destination, "_image.png"), "utf8")).toBe("image");
      expect(fs.existsSync(path.join(destination, "post.txt"))).toBe(true);
      expect(fs.existsSync(assets)).toBe(false);
      done();
    });
  });
});
