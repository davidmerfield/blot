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

        var previewFile = localPath(
          this.blog.id,
          previewPath("/drafts/post")
        );

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
                        expect(aggregatedEntry.metadata._sourcePaths).toBeUndefined();

                        Entry.get(blogID, "/images/photo.md", function (oldEntry) {
                          if (oldEntry) {
                            expect(oldEntry.deleted).toBeTrue();
                          }
                          done();
                        });
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
