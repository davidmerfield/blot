var fs = require("fs-extra");
var join = require("path").join;

describe("template", function () {
  var writeToFolder = require("../index").writeToFolder;
  var setView = require("../index").setView;
  var setMetadata = require("../index").setMetadata;

  require("./setup")({ createTemplate: true });

  afterEach(function () {
    fs.removeSync(this.blogDirectory + "/Templates");
    fs.removeSync(this.blogDirectory + "/templates");
    fs.removeSync(this.blogDirectory + "/posts");
    fs.removeSync(this.blogDirectory + "/drafts");
  });

  it("writes a template to a folder", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);
        var upperPath =
          test.blogDirectory +
          "/Templates/" +
          test.template.slug +
          "/" +
          view.name;
        var lowerPath =
          test.blogDirectory +
          "/templates/" +
          test.template.slug +
          "/" +
          view.name;
        var targetPath = fs.existsSync(upperPath) ? upperPath : lowerPath;
        expect(fs.readFileSync(targetPath, "utf-8")).toEqual(view.content);
        if (targetPath === upperPath) {
          expect(fs.existsSync(test.blogDirectory + "/templates")).toEqual(
            false
          );
        } else {
          expect(fs.existsSync(test.blogDirectory + "/Templates")).toEqual(
            false
          );
        }
        done();
      });
    });
  });

  it("writes template metadata to package.json in a folder", function (done) {
    var test = this;
    var metadata = { locals: { foo: "bar" } };

    setMetadata(this.template.id, metadata, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);
        var upperPath =
          test.blogDirectory +
          "/Templates/" +
          test.template.slug +
          "/package.json";
        var lowerPath =
          test.blogDirectory +
          "/templates/" +
          test.template.slug +
          "/package.json";
        var targetPath = fs.existsSync(upperPath) ? upperPath : lowerPath;
        expect(fs.readJsonSync(targetPath).locals).toEqual(metadata.locals);
        done();
      });
    });
  });

  it("writes view metadata to package.json to a folder", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
      locals: { foo: "bar" },
    };

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);
        var upperPath =
          test.blogDirectory +
          "/Templates/" +
          test.template.slug +
          "/package.json";
        var lowerPath =
          test.blogDirectory +
          "/templates/" +
          test.template.slug +
          "/package.json";
        var targetPath = fs.existsSync(upperPath) ? upperPath : lowerPath;
        expect(fs.readJsonSync(targetPath).views[view.name].locals).toEqual(
          view.locals
        );
        done();
      });
    });
  });

  it("reuses an existing lowercase templates directory", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };
    var lowercaseBase = test.blogDirectory + "/templates";
    var expectedPath =
      lowercaseBase + "/" + test.template.slug + "/" + view.name;

    fs.ensureDirSync(lowercaseBase);

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);

        expect(fs.readFileSync(expectedPath, "utf-8")).toEqual(view.content);
        expect(fs.existsSync(test.blogDirectory + "/Templates")).toEqual(false);
        done();
      });
    });
  });

  it("creates lowercase templates when root entries are lowercase", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };
    var posts = test.blogDirectory + "/posts";
    var drafts = test.blogDirectory + "/drafts";
    var lowercasePath =
      test.blogDirectory + "/templates/" + test.template.slug + "/" + view.name;

    fs.ensureDirSync(posts);
    fs.ensureDirSync(drafts);

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) {
          fs.removeSync(posts);
          fs.removeSync(drafts);
          return done.fail(err);
        }

        try {
          expect(fs.readFileSync(lowercasePath, "utf-8")).toEqual(view.content);
          expect(fs.existsSync(test.blogDirectory + "/Templates")).toEqual(false);
        } catch (assertErr) {
          fs.removeSync(posts);
          fs.removeSync(drafts);
          return done.fail(assertErr);
        }

        fs.removeSync(posts);
        fs.removeSync(drafts);
        done();
      });
    });
  });

  it("skips rewriting files when contents have not changed", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);

        var targetPath = getTemplatePath(test, view.name);
        var originalStat = fs.statSync(targetPath);

        writeToFolder(test.blog.id, test.template.id, function (err) {
          if (err) return done.fail(err);

          var updatedStat = fs.statSync(targetPath);
          expect(updatedStat.mtimeMs).toEqual(originalStat.mtimeMs);
          done();
        });
      });
    });
  });

  it("removes orphaned files left in the template directory", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);

        var templateDir = getTemplateDir(test);
        var orphanPath = join(templateDir, "orphan.html");
        fs.outputFileSync(orphanPath, "orphan");

        writeToFolder(test.blog.id, test.template.id, function (err) {
          if (err) return done.fail(err);

          expect(fs.existsSync(orphanPath)).toEqual(false);
          expect(fs.readFileSync(join(templateDir, view.name), "utf-8")).toEqual(
            view.content
          );
          done();
        });
      });
    });
  });
});

function getTemplateDir(test) {
  var upperPath =
    test.blogDirectory + "/Templates/" + test.template.slug;
  var lowerPath =
    test.blogDirectory + "/templates/" + test.template.slug;

  return fs.existsSync(upperPath) ? upperPath : lowerPath;
}

function getTemplatePath(test, fileName) {
  var templateDir = getTemplateDir(test);
  return join(templateDir, fileName);
}
