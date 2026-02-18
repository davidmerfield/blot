describe("dropbox client - sync-root-directory", function () {
  // Create test user and tmp directory
  require("./setup")({ root: true });

  var fs = require("fs-extra");
  var write = require("../write");
  var sync = require("../sync");

  xit("syncs changes to the root folder of a Dropbox", function (done) {
    var blogDirectory = this.blogDirectory;
    var blog = this.blog;

    var path = this.fake.path(".txt");
    var contents = this.fake.file();
    var contentsInBlogDirectory;

    write(blog.id, path, contents, function (err) {
      if (err) return done.fail(err);

      sync(blog, function (err) {
        if (err) return done.fail(err);

        try {
          contentsInBlogDirectory = fs
            .readFileSync(blogDirectory + path)
            .toString("utf-8");
        } catch (e) {
          var message = [
            "Error " + e.message + " " + e.code,
            "Contents of blog folder: " + fs.readdirSync(blogDirectory),
          ].join("\n");
          return done.fail(new Error(message));
        }

        expect(contentsInBlogDirectory).toEqual(contents);
        done();
      });
    });
  });
});
