describe("Blog.set", function () {
  var set = require("../set");
  var get = require("../get");

  global.test.blog();

  it("will set the domain", function (done) {
    var test = this;
    var domain = "example.com";

    set(test.blog.id, { domain: domain }, function (err) {
      if (err) return done.fail(err);

      done();
    });
  });

  it("disables image metadata when turned off", function (done) {
    var test = this;

    set(test.blog.id, { imageExif: "off" }, function (errors) {
      if (errors) return done.fail(errors);

      get({ id: test.blog.id }, function (err, blog) {
        if (err) return done.fail(err);

        expect(blog.imageExif).toBe("off");
        expect(blog.isImageExifOff).toBeTrue();
        expect(blog.isImageExifBasic).toBeFalse();
        done();
      });
    });
  });

  it("saves full image metadata preference", function (done) {
    var test = this;

    set(test.blog.id, { imageExif: "full" }, function (errors) {
      if (errors) return done.fail(errors);

      get({ id: test.blog.id }, function (err, blog) {
        if (err) return done.fail(err);

        expect(blog.imageExif).toBe("full");
        expect(blog.isImageExifFull).toBeTrue();
        expect(blog.isImageExifOff).toBeFalse();
        done();
      });
    });
  });
});
