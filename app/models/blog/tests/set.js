describe("Blog.set", function () {
  var set = require("../set");
  var get = require("../get");
  var key = require("../key");
  var client = require("models/client");
  var config = require("config");

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
        expect(blog.isImageExifOff).toBe(true);
        expect(blog.isImageExifBasic).toBe(false);
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
        expect(blog.isImageExifFull).toBe(true);
        expect(blog.isImageExifOff).toBe(false);
        done();
      });
    });
  });

  it("updates the handle host without touching custom domains", function (done) {
    var test = this;
    var originalHandle = test.blog.handle;
    var newHandle = originalHandle + "new";
    var oldHostKey = key.domain(originalHandle + "." + config.host);
    var newHostKey = key.domain(newHandle + "." + config.host);
    var preservedKey = key.domain("keep." + config.host);
    var customDomain = "custom-domain.test";
    var customDomainKey = key.domain(customDomain);

    client.set(preservedKey, "keep", function (err) {
      if (err) return done.fail(err);

      set(test.blog.id, { domain: customDomain }, function (err) {
        if (err) return done.fail(err);

        client.mget([oldHostKey, customDomainKey], function (
          err,
          valuesBefore
        ) {
          if (err) return done.fail(err);

          expect(valuesBefore[0]).toBe(test.blog.id);
          expect(valuesBefore[1]).toBe(test.blog.id);

          set(test.blog.id, { handle: newHandle }, function (err) {
            if (err) return done.fail(err);

            client.mget(
              [oldHostKey, preservedKey, newHostKey, customDomainKey],
              function (err, values) {
                if (err) return done.fail(err);

                expect(values[0]).toBe(null);
                expect(values[1]).toBe("keep");
                expect(values[2]).toBe(test.blog.id);
                expect(values[3]).toBe(test.blog.id);
                done();
              }
            );
          });
        });
      });
    });
  });
});
