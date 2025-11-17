describe("dropbox client", function () {
  // Create test user and tmp directory
  require("./setup")();

  var fs = require("fs-extra");
  var write = require("../write");
  var sync = require("../sync");

  xit("syncs changes when the blog folder is moved", function (done) {
    var blogDirectory = this.blogDirectory;
    var folder = this.folder;
    var newFolder =
      "/" + this.fake.random.word() + " " + this.fake.random.word();
    var client = this.client;
    var blog = this.blog;

    var path = this.fake.path(".txt");
    var contents = this.fake.file();
    var secondPath = this.fake.path(".txt");
    var secondContents = this.fake.file();

    write(blog.id, path, contents, function (err) {
      if (err) return done.fail(err);

      sync(blog, function (err) {
        if (err) return done.fail(err);

        client
          .filesMove({
            from_path: folder,
            to_path: newFolder,
            autorename: false,
          })
          .then(function () {
            write(blog.id, secondPath, secondContents, function (err) {
              if (err) return done.fail(err);

              sync(blog, function (err) {
                if (err) return done.fail(err);

                expect(
                  fs.readFileSync(blogDirectory + path).toString("utf-8")
                ).toEqual(contents);
                expect(
                  fs.readFileSync(blogDirectory + secondPath).toString("utf-8")
                ).toEqual(secondContents);

                done();
              });
            });
          })
          .catch(function (err) {
            done.fail(err);
          });
      });
    });
  });
});
