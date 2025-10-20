describe("rebuild dependents cleanup", function () {
  var rebuildDependents = require("../update/rebuildDependents");
  var Entry = require("models/entry");

  global.test.blog();

  it("drops dependents when the source file disappears", async function (done) {
    const imagePath = "/assets/image.png";
    const postPath = "/post.txt";

    await this.blog.write({
      path: imagePath,
      content: await global.test.fake.pngBuffer(),
    });

    await this.blog.write({
      path: postPath,
      content: `![Alt](${imagePath})`,
    });

    await this.blog.rebuild();

    await this.blog.check({ path: postPath });

    await this.blog.remove(postPath);

    rebuildDependents(this.blog.id, imagePath, (err) => {
      if (err) return done.fail(err);

      Entry.get(this.blog.id, postPath, function (entry) {
        expect(entry).toBeDefined();
        expect(entry.deleted).toBe(true);
        done();
      });
    });
  });
});
