describe("Blog.create", function () {
  var create = require("../create");
  var remove = require("../remove");
  var getAllIDs = require("../getAllIDs");

  // Create a test user before each spec
  global.test.user();

  // Clean up a blog created during tests
  afterEach(function (done) {
    if (this.blog) {
      remove(this.blog.id, done);
    } else {
      done();
    }
  });

  it("creates a blog", function (done) {
    var test = this;

    create(test.user.uid, { handle: "exampleblog" }, function (err, blog) {
      if (err) return done.fail(err);

      test.blog = blog; // will be cleaned up at the end of this test

      expect(blog).toEqual(jasmine.any(Object));
      done();
    });
  });

  it("defaults image exif preferences", function (done) {
    var test = this;

    create(test.user.uid, { handle: "exampleblog" }, function (err, blog) {
      if (err) return done.fail(err);

      test.blog = blog;

      expect(blog.imageExif).toBe("basic");
      expect(blog.isImageExifBasic).toBeTrue();
      expect(blog.isImageExifOff).toBeFalse();

      done();
    });
  });

  it("adds created blog to list of all blogs", function (done) {
    var test = this;

    create(test.user.uid, { handle: "exampleblog" }, function (err, blog) {
      if (err) return done.fail(err);

      test.blog = blog; // will be cleaned up at the end of this test

      getAllIDs(function (err, ids) {
        expect(ids).toContain(blog.id);
        done();
      });
    });
  });
});
