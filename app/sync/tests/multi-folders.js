describe("sync multi-folder support", function () {
  var fs = require("fs-extra");
  var path = require("path");
  var async = require("async");
  var Entry = require("models/entry");
  var syncFolder = require("sync");
  var localPath = require("helper/localPath");
  var drafts = require("../update/drafts");
  var previewPath = drafts.previewPath;

  global.test.blog();

  global.test.timeout(60 * 1000); // 60s

  beforeEach(function () {
    this.fake = global.test.fake;
    this.checkEntry = global.test.CheckEntry(this.blog.id);
    this.syncAndCheck = global.test.SyncAndCheck(this.blog.id);
  });

  it("builds an aggregated entry and drops child entries", function (done) {
    this.syncAndCheck(
      [
        { path: "/album+/one.md", content: "# One" },
        { path: "/album+/two.md", content: "# Two" },
      ],
      [
        {
          path: "/album",
          html: function (html) {
            return html.indexOf("One") > -1 && html.indexOf("Two") > -1;
          },
          metadata: function (metadata) {
            return !metadata._sourcePaths;
          },
        },
        { path: "/album+/one.md", ignored: true },
        { path: "/album+/two.md", ignored: true },
      ],
      done
    );
  });

  it("aggregates nested multi-folder files in alphabetical order", function (done) {
    this.syncAndCheck(
      [
        { path: "/album+/1.md", content: "# One" },
        { path: "/album+/2/a.md", content: "# Two A" },
        { path: "/album+/2/b.md", content: "# Two B" },
        { path: "/album+/3.md", content: "# Three" },
      ],
      [
        {
          path: "/album",
          html: function (html) {
            var order = [
              'data-file="/album+/1.md"',
              'data-file="/album+/2/a.md"',
              'data-file="/album+/2/b.md"',
              'data-file="/album+/3.md"',
            ];

            var lastIndex = -1;

            return order.every(function (token) {
              var index = html.indexOf(token);
              if (index === -1 || index < lastIndex) return false;
              lastIndex = index;
              return true;
            });
          },
          metadata: function (metadata) {
            return !metadata._sourcePaths;
          },
        },
        { path: "/album+/1.md", ignored: true },
        { path: "/album+/2/a.md", ignored: true },
        { path: "/album+/2/b.md", ignored: true },
        { path: "/album+/3.md", ignored: true },
      ],
      done
    );
  });

  it("ignores hidden files inside multi-folders", function (done) {
    this.syncAndCheck(
      [
        { path: "/album+/one.md", content: "# One" },
        { path: "/album+/_two.md", content: "# Two" },
        { path: "/album+/_hidden/three.md", content: "# Three" },
      ],
      [
        {
          path: "/album",
          html: function (html) {
            return (
              html.indexOf("One") > -1 &&
              html.indexOf("Two") === -1 &&
              html.indexOf("Three") === -1
            );
          },
        },
        { path: "/album+/one.md", ignored: true },
        { path: "/album+/_two.md", ignored: true },
        { path: "/album+/_hidden/three.md", ignored: true },
      ],
      done
    );
  });

  it("skips multi-folder aggregation when more than 50 files exist", async function () {
    for (var i = 1; i <= 51; i++) {
      var name = i < 10 ? "0" + i : String(i);
      await this.blog.write({
        path: "/album+/" + name + ".md",
        content: "# File " + name,
      });
    }

    await this.blog.rebuild();

    try {
      await this.blog.check({ path: "/album+" });
      throw new Error("Multi-folder post built incorrectly");
    } catch (e) {
      expect(e.message).toContain("No entry exists");
    }

    try {
      await this.blog.check({ path: "/album+/1.md" });
      throw new Error("Multi-folder post built incorrectly");
    } catch (e) {
      expect(e.message).toContain("No entry exists");
    }
  });

  it("writes previews for aggregated draft entries", function (done) {
    this.syncAndCheck(
      { path: "/drafts/post+/index.md", content: "# Draft" },
      {
        path: "/drafts/post",
        draft: true,
        metadata: function (metadata) {
          return !metadata._sourcePaths;
        },
      },
      (err) => {
        if (err) return done.fail(err);

        var previewFile = localPath(this.blog.id, previewPath("/drafts/post"));

        expect(fs.existsSync(previewFile)).toBe(true);
        done();
      }
    );
  });

  it("handles renaming a directory to use the + convention", function (done) {
    var blogID = this.blog.id;
    var root = this.blogDirectory;

    syncFolder(blogID, function (err, folder, finish) {
      if (err) return done.fail(err);

      async.series(
        [
          function (next) {
            fs.outputFileSync(path.join(root, "images/photo.md"), "# Photo");
            folder.update("/images/photo.md", next);
          },
        ],
        function (err) {
          finish(err, function (finishErr) {
            if (err || finishErr) return done.fail(err || finishErr);

            Entry.get(blogID, "/images/photo.md", function (initialEntry) {
              expect(initialEntry).toBeDefined();

              fs.moveSync(
                path.join(root, "images"),
                path.join(root, "images+")
              );

              syncFolder(blogID, function (err2, folder2, finish2) {
                if (err2) return done.fail(err2);

                async.series(
                  [
                    function (next) {
                      folder2.update("/images/photo.md", next);
                    },
                    function (next) {
                      folder2.update("/images+/photo.md", next);
                    },
                    function (next) {
                      folder2.update("/images+", next);
                    },
                  ],
                  function (seriesErr) {
                    finish2(seriesErr, function (finishErr2) {
                      if (seriesErr || finishErr2)
                        return done.fail(seriesErr || finishErr2);

                      Entry.get(blogID, "/images", function (aggregatedEntry) {
                        expect(aggregatedEntry).toBeDefined();
                        expect(aggregatedEntry.deleted).toBeFalsy();
                        expect(aggregatedEntry.path).toEqual("/images");
                        expect(
                          aggregatedEntry.metadata._sourcePaths
                        ).toBeUndefined();

                        Entry.get(
                          blogID,
                          "/images/photo.md",
                          function (oldEntry) {
                            if (oldEntry) {
                              expect(oldEntry.deleted).toBe(true);
                            }
                            done();
                          }
                        );
                      });
                    });
                  }
                );
              });
            });
          });
        }
      );
    });
  });
});
