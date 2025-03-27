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
});
