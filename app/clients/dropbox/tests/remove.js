describe("dropbox client - remove", function () {
  // Create test user and tmp directory
  require("./setup")();

  var fs = require("fs-extra");
  var write = require("../write");
  var remove = require("../remove");

  beforeEach(function () {
    this.path = this.fake.path(".txt");
  });

  afterEach(function (done) {
    expect(fs.existsSync(this.blogDirectory + this.path)).toEqual(false);
    this.client
      .filesGetMetadata({
        path: this.folder + this.path,
        include_deleted: true,
      })
      .then(function (res) {
        // Verify file no longer exists on Dropbox
        expect(res[".tag"]).toEqual("deleted");
        // Verify the file no longer exists in blog folder
        done();
      })
      .catch(function (err) {
        if (err && err.status === 409) return done();
        done(new Error(err));
      });
  });

  xit("does not return an error when you remove a non-existent file", function (done) {
    remove(this.blog.id, this.path, done);
  });

  xit("does not return an error when you remove a file which exists on Dropbox but not on Blot", function (done) {
    var path = this.path;
    var blog = this.blog;
    var blogDirectory = this.blogDirectory;
    var contents = this.fake.file();

    write(blog.id, path, contents, function (err) {
      if (err) return done.fail(err);

      fs.removeSync(blogDirectory + path);
      remove(blog.id, path, done);
    });
  });

  xit("does not return an error when you remove a file which exists on Blot but not on Dropbox", function (done) {
    fs.outputFileSync(this.blogDirectory + this.path, this.fake.file());
    remove(this.blog.id, this.path, done);
  });

  xit("removes a file", function (done) {
    var contents = this.fake.file();
    var blog = this.blog;
    var path = this.path;

    write(blog.id, path, contents, function (err) {
      if (err) return done.fail(err);

      remove(blog.id, path, done);
    });
  });
});
