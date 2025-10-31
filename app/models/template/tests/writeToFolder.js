var fs = require("fs-extra");
var join = require("path").join;
var clients = require("clients");

describe("template", function () {
  var writeToFolder = require("../index").writeToFolder;
  var setView = require("../index").setView;
  var dropView = require("../index").dropView;
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

  it("removes deleted views for clients without local copies", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };
    var removals = [];
    var fakeClient = {
      display_name: "Fake",
      description: "Fake client",
      disconnect: function (id, callback) {
        if (callback) callback();
      },
      write: function (blogID, path, content, callback) {
        process.nextTick(callback);
      },
      remove: function (blogID, path, callback) {
        removals.push({ blogID: blogID, path: path });
        process.nextTick(callback);
      },
    };

    fakeClient.name = "fake";

    var finished = false;

    function finalize(err) {
      if (finished) return;
      finished = true;
      delete clients.fake;

      test.blog
        .update({ client: null })
        .then(function () {
          if (err) {
            done.fail(err);
          } else {
            done();
          }
        })
        .catch(function (updateErr) {
          done.fail(updateErr);
        });
    }

    clients.fake = fakeClient;

    setView(this.template.id, view, function (err) {
      if (err) return finalize(err);

      test.blog
        .update({ client: "fake" })
        .then(function () {
          writeToFolder(test.blog.id, test.template.id, function (err) {
            if (err) return finalize(err);

            dropView(test.template.id, view.name, function (err) {
              if (err) return finalize(err);

              writeToFolder(test.blog.id, test.template.id, function (err) {
                if (err) return finalize(err);

                try {
                  expect(removals.length).toEqual(1);
                  expect(removals[0].path).toContain(view.name);

                  var templateDir = getTemplateDir(test);
                  expect(
                    fs.existsSync(join(templateDir, view.name))
                  ).toEqual(false);
                } catch (assertErr) {
                  return finalize(assertErr);
                }

                finalize();
              });
            });
          });
        })
        .catch(function (updateErr) {
          finalize(updateErr);
        });
    });
  });

  it("removes orphans while preserving existing files with the local client", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };

    this.blog
      .update({ client: "local" })
      .then(function () {
        setView(test.template.id, view, function (err) {
          if (err) return done.fail(err);

          writeToFolder(test.blog.id, test.template.id, function (err) {
            if (err) return done.fail(err);

            var templateDir = getTemplateDir(test);
            var viewPath = join(templateDir, view.name);
            var originalStat = fs.statSync(viewPath);
            var orphanPath = join(templateDir, "orphan.html");

            fs.outputFileSync(orphanPath, "orphan");

            writeToFolder(test.blog.id, test.template.id, function (err) {
              if (err) return done.fail(err);

              var rewrittenStat = fs.statSync(viewPath);

              expect(fs.existsSync(orphanPath)).toEqual(false);
              expect(rewrittenStat.mtimeMs).toEqual(originalStat.mtimeMs);
              expect(fs.readFileSync(viewPath, "utf-8")).toEqual(view.content);
              done();
            });
          });
        });
      })
      .catch(function (err) {
        done.fail(err);
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
