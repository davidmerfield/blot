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
      "## Second\n\n![Image](/album+/cover.jpg)"
    );
    fs.outputFileSync(path.join(root, "cover.jpg"), Buffer.from("fake"));

    var entry = await this.buildEntry("/album+");

    expect(entry.path).toEqual("/album");
    expect(entry.html).toContain(
      '<section class="multi-file-post" data-folder="/album+">'
    );
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/album+/cover.jpg" data-index="0" data-extension="jpg">'
    );
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/album+/one.md" data-index="1" data-extension="md">'
    );
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/album+/two.md" data-index="2" data-extension="md">'
    );
    expect(entry.html).toContain("<h1 id=\"one\">One</h1>");
    expect(entry.html).toContain("<p>Body</p>");
    expect(entry.html).toContain("<h2 id=\"second\">Second</h2>");
    expect(entry.metadata._sourcePaths.sort()).toEqual([
      "/album+/cover.jpg",
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
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/note+/first.md" data-index="0" data-extension="md">'
    );
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/note+/second.md" data-index="1" data-extension="md">'
    );
    expect(entry.html).toContain("First");
    expect(entry.html).toContain("Second");
  });

  it("injects a folder-based title when no heading exists", async function () {
    var root = path.join(this.blogDirectory, "vacation-photos+");

    fs.outputFileSync(
      path.join(root, "notes.md"),
      "A quiet afternoon on the beach."
    );

    var entry = await this.buildEntry("/vacation-photos+");

    expect(entry.html).toContain(
      '<h1 class="multi-file-title">Vacation Photos</h1>'
    );
    expect(entry.html).toContain(
      '<section class="multi-file-entry" data-file="/vacation-photos+/notes.md" data-index="0" data-extension="md">'
    );
  });

  it("maps bracketed plus folders to a stripped entry path", function () {
    expect(build.findMultiFolder("/[Blog]+/one.md")).toEqual({
      folderPath: "/[Blog]+",
      entryPath: "/[Blog]",
      triggerPath: "/[Blog]+/one.md",
    });
  });

  it("omits files whose converter is disabled", async function () {
    this.blog.converters = Object.assign({}, this.blog.converters, {
      img: false,
    });

    var root = path.join(this.blogDirectory, "album+");
    fs.outputFileSync(path.join(root, "one.md"), "# One");
    fs.outputFileSync(path.join(root, "cover.jpg"), Buffer.from("fake"));

    var entry = await this.buildEntry("/album+");

    expect(entry.metadata._sourcePaths).toEqual(["/album+/one.md"]);
    expect(entry.html).not.toContain("cover.jpg");
  });

  it("unions comma-separated tags from every source file", async function () {
    var root = path.join(this.blogDirectory, "tagged+");

    fs.outputFileSync(
      path.join(root, "one.md"),
      "Tags: alpha, beta\n\n# One"
    );
    fs.outputFileSync(
      path.join(root, "two.md"),
      "Tags: beta, gamma\n\n# Two"
    );

    var entry = await this.buildEntry("/tagged+");

    expect(entry.tags.slice().sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("unions tags even when source files spell the key with different case", async function () {
    var root = path.join(this.blogDirectory, "tagcase+");

    fs.outputFileSync(path.join(root, "one.md"), "Tags: alpha\n\n# One");
    fs.outputFileSync(path.join(root, "two.md"), "tags: beta\n\n# Two");

    var entry = await this.buildEntry("/tagcase+");

    expect(entry.tags.slice().sort()).toEqual(["alpha", "beta"]);
  });

  it("excludes .textbundle asset files from folder post sources", async function () {
    var root = path.join(this.blogDirectory, "bundle+");

    fs.outputFileSync(
      path.join(root, "note.textbundle", "text.md"),
      "# Note\n\n![Pic](assets/pic.png)"
    );
    fs.outputFileSync(
      path.join(root, "note.textbundle", "assets", "pic.png"),
      Buffer.from("fake")
    );

    var entry = await this.buildEntry("/bundle+");

    expect(entry.metadata._sourcePaths).not.toContain(
      "/bundle+/note.textbundle/assets/pic.png"
    );
    expect(entry.html).not.toContain(
      'data-file="/bundle+/note.textbundle/assets/pic.png"'
    );
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
