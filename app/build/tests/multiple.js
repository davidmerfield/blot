describe("build multiple", function () {
  var build = require("../index");
  var fs = require("fs-extra");
  var path = require("path");

  global.test.blog();

  beforeEach(function () {
    this.buildEntry = (targetPath) =>
      new Promise((resolve, reject) => {
        build(this.blog, targetPath, function (err, entry) {
          if (err) return reject(err);
          resolve(entry);
        });
      });
  });

  it("aggregates convertible files inside a + folder", async function () {
    var root = path.join(this.blogDirectory, "album+");

    fs.outputFileSync(path.join(root, "one.md"), "# One\n\nBody");
    fs.outputFileSync(
      path.join(root, "two.md"),
      "Title: Second\n\n![Image](/album+/cover.jpg)"
    );
    fs.outputFileSync(path.join(root, "cover.jpg"), Buffer.from("fake"));

    var entry = await this.buildEntry("/album+");

    expect(entry.path).toEqual("/album");
    expect(entry.html).toContain("<h1 id=\"one\">One</h1>");
    expect(entry.html).toContain("<p>Body</p>");
    expect(entry.html).toContain("Second");
    expect(entry.metadata._sourcePaths).toEqual([
      "/album+/one.md",
      "/album+/two.md",
    ]);
    expect(entry.dependencies).toEqual([
      "/album+/cover.jpg",
    ]);
  });

  it("builds the aggregated entry when a child file is targeted", async function () {
    var root = path.join(this.blogDirectory, "note+");

    fs.outputFileSync(path.join(root, "first.md"), "# First");
    fs.outputFileSync(path.join(root, "second.md"), "# Second");

    var entry = await this.buildEntry("/note+/first.md");

    expect(entry.path).toEqual("/note");
    expect(entry.html).toContain("First");
    expect(entry.html).toContain("Second");
  });

  it("returns an EMPTY error when no convertible files are present", function (done) {
    var root = path.join(this.blogDirectory, "void+");
    fs.ensureDirSync(root);

    build(this.blog, "/void+", function (err) {
      expect(err).toBeDefined();
      expect(err.code).toEqual("EMPTY");
      done();
    });
  });
});
