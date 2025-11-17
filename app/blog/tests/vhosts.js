describe("blog server vhosts", function () {
  var vhosts = require("../vhosts");
  var config = require("config");

  it("extracts a blot domain", function (done) {
    var ctx = this;
    var host = this.blog.handle + "." + config.host;

    this.url("http://" + host);

    vhosts(this.req, this.res, function (err) {
      expect(err).not.toBeDefined();
      expect(ctx.req.originalHost).toEqual(host);
      expect(ctx.req.blog).toEqual(jasmine.any(Object));
      done();
    });
  });

  it("extracts a preview domain for one of Blot's template", function (done) {
    var ctx = this;
    var template = "default";
    var host =
      "preview." + template + "." + this.blog.handle + "." + config.host;

    this.url("http://" + host);

    vhosts(this.req, this.res, function (err) {
      expect(err).not.toBeDefined();
      expect(ctx.req.originalHost).toEqual(host);
      expect(ctx.req.preview).toEqual(true);
      expect(ctx.req.blog.template).toContain(template);
      expect(ctx.req.blog.template).not.toContain(ctx.blog.id);
      done();
    });
  });

  it("extracts a preview domain for one of the user's template", function (done) {
    var ctx = this;
    var template = "default";
    var host =
      "preview.my." + template + "." + this.blog.handle + "." + config.host;

    this.url("http://" + host);

    vhosts(this.req, this.res, function (err) {
      expect(err).not.toBeDefined();
      expect(ctx.req.originalHost).toEqual(host);
      expect(ctx.req.preview).toEqual(true);
      expect(ctx.req.blog.template).toContain(template);
      expect(ctx.req.blog.template).toContain(ctx.blog.id);
      done();
    });
  });

  it("works as expected", function () {
    expect(function () {
      var assert = require("assert");
      const {
        isSubdomain,
        extractHandle,
        extractPreviewTemplate,
      } = require("../vhosts");
      assert(isSubdomain("david." + config.host));
      assert(isSubdomain("a.b.c.d.e.f.g." + config.host));

      assert.equal(isSubdomain(config.host), false);
      assert.equal(isSubdomain("d.BLOG.im"), false);
      assert.equal(isSubdomain("google.com"), false);
      assert.equal(isSubdomain("...blot.im.."), false);
      assert.equal(isSubdomain("." + config.host), false);
      assert.equal(isSubdomain(""), false);

      assert.equal(extractHandle("david." + config.host), "david");
      assert.equal(
        extractHandle("preview.my.theme.david." + config.host),
        "david"
      );
      assert.equal(extractHandle("david.merfield." + config.host), "merfield");
      assert.equal(extractHandle("david.merfield.google.com"), "");

      assert.equal(extractPreviewTemplate("foo.david." + config.host), false);
      assert.equal(extractPreviewTemplate("david." + config.host), false);
      assert.equal(extractPreviewTemplate(config.host), false);
      assert.equal(extractPreviewTemplate(""), false);
      assert.equal(extractPreviewTemplate("google.com"), false);
      assert.equal(extractPreviewTemplate("preview." + config.host), false);
      assert.equal(
        extractPreviewTemplate("preview.david." + config.host),
        false
      );
      assert.equal(
        extractPreviewTemplate("preview.this.david.blot.com"),
        false
      );
      assert.equal(
        extractPreviewTemplate("this.preview.my.foo.david." + config.host),
        false
      );

      assert.deepEqual(
        extractPreviewTemplate("preview.foo.david." + config.host),
        "SITE:foo"
      );
      assert.deepEqual(
        extractPreviewTemplate("preview.my.foo.david." + config.host),
        "undefined:foo"
      );
    }).not.toThrow();
  });

  global.test.blog();

  beforeEach(function () {
    var ctx = this;

    ctx.url = function (url) {
      ctx.url = require("url").parse(url);
    };

    ctx.req = {
      get: function () {
        return ctx.url.hostname;
      },
      log: function () {},
      url: ctx.url.pathname,
      protocol: ctx.url.protocol,
    };

    ctx.res = {
      set: function () {},
      removeHeader: function () {},
    };
  });
});
