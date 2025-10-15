describe("build", function () {
  const build = require("build");
  const fs = require("fs-extra");

  global.test.blog();

  beforeEach(function () {
    this.buildAndCheck = ({ path, contents }, expectedEntry, cb) => {
      fs.outputFileSync(this.blogDirectory + path, contents);
      build(this.blog, path, function (err, entry) {
        for (let key in expectedEntry)
          expect(expectedEntry[key]).toEqual(entry[key]);
        cb();
      });
    };
  });

  it("will use a title to generate an image caption over the alt text", function (done) {
    const contents = `![Alt text here](foo.jpg "Title here")`;
    const path = "/hello.txt";
    const html =
      '<p><img src="/foo.jpg" title="Title here" alt="Alt text here"><span class="caption">Title here</span></p>';

    this.blog.plugins.imageCaption = { enabled: true, options: {} };
    this.buildAndCheck({ path, contents }, { html }, done);
  });

  it("will turn titles into title case if plugin is enabled", function (done) {
    const contents = "# Title goes here";
    const path = "/hello.txt";
    const html = '<h1 id="title-goes-here">Title Goes Here</h1>';

    this.blog.plugins.titlecase = { enabled: true, options: {} };
    this.buildAndCheck({ path, contents }, { html }, done);
  });

  it("will turn titles with nested children into title case if plugin is enabled", function (done) {
    const contents = "# Title *goes [with](/here)* children";
    const path = "/hello.txt";
    const html =
      '<h1 id="title-goes-with-children">Title <em>Goes <a href="/here">With</a></em> Children</h1>';

    this.blog.plugins.titlecase = { enabled: true, options: {} };
    this.buildAndCheck({ path, contents }, { html }, done);
  });

  it("defaults embedded media preload to metadata", function (done) {
    const path = "/media.txt";
    const contents = [
      '<audio controls src="/audio/example.mp3"></audio>',
      '<video controls src="/video/example.mp4"></video>',
      '<audio controls preload="none" src="/audio/custom.mp3"></audio>',
      '<video controls preload="auto" src="/video/custom.mp4"></video>',
    ].join("\n");

    fs.outputFileSync(this.blogDirectory + path, contents);

    this.blog.plugins.mediaPreload = { enabled: true, options: {} };

    build(this.blog, path, (err, entry) => {
      if (err) return done.fail(err);

      expect(entry.html).toContain(
        '<audio controls="" src="/audio/example.mp3" preload="metadata">'
      );
      expect(entry.html).toContain(
        '<video controls="" src="/video/example.mp4" preload="metadata">'
      );
      expect(entry.html).toContain(
        '<audio controls="" preload="none" src="/audio/custom.mp3">'
      );
      expect(entry.html).toContain(
        '<video controls="" preload="auto" src="/video/custom.mp4">'
      );

      done();
    });
  });
});
