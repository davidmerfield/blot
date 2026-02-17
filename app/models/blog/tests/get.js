describe("Blog.get", function () {
  var get = require("../get");
  var key = require("../key");
  var client = require("models/client");

  global.test.blog();

  it("falls back to safe image metadata defaults", function (done) {
    var test = this;

    client.hdel(key.info(test.blog.id), "imageExif", function (err) {
      if (err) return done.fail(err);

      get({ id: test.blog.id }, function (err, blog) {
        if (err) return done.fail(err);

        expect(blog.imageExif).toBe("off");
        expect(blog.isImageExifOff).toBe(true);
        expect(blog.isImageExifBasic).toBe(false);
        done();
      });
    });
  });

  it("falls back to converter defaults when missing", function (done) {
    var test = this;

    client.hdel(key.info(test.blog.id), "converters", function (err) {
      if (err) return done.fail(err);

      get({ id: test.blog.id }, function (err, blog) {
        if (err) return done.fail(err);

        expect(blog.converters.img).toBe(true);
        expect(blog.converters.markdown).toBe(true);
        expect(blog.converters.docx).toBe(true);
        done();
      });
    });
  });
});
