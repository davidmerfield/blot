describe("cdn", function () {
  var cdn = require("blog/render/retrieve/cdn");
  var mustache = require("mustache");
  var config = require("config");
  var generateCdnUrl = require("models/template/util/generateCdnUrl");

  global.test.blog();

  beforeEach(function () {
    this.request = {
      protocol: "http",
      get: function () {
        return "example.com";
      },
      preview: false,
      template: {
        id: "SITE:blog",
        cdn: {
          "style.css": "abc123def456ghi789jkl012mno345pq",
        },
      },
    };
  });

  it("returns CDN URL for normal requests with SITE template", function (done) {
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toContain(config.cdn.origin);
      expect(result).toContain("/template/");
      expect(result).toContain("style");
      expect(result).toContain(".css");
      expect(result).toContain("abc123def456ghi789jkl012mno345pq");
      done();
    });
  });

  it("returns CDN URL for normal requests with custom template", function (done) {
    this.request.template.id = this.blog.id + ":custom";
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toContain(config.cdn.origin);
      expect(result).toContain("/template/");
      expect(result).toContain("style");
      expect(result).toContain(".css");
      expect(result).toContain("abc123def456ghi789jkl012mno345pq");
      done();
    });
  });

  it("skips CDN URL for preview subdomains on custom templates", function (done) {
    this.request.preview = true;
    this.request.template.id = this.blog.id + ":custom";
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toBe("/style.css");
      expect(result).not.toContain(config.cdn.origin);
      done();
    });
  });

  it("still uses CDN URL for preview subdomains on SITE templates", function (done) {
    this.request.preview = true;
    this.request.template.id = "SITE:blog";
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toContain(config.cdn.origin);
      expect(result).toContain("/template/");
      expect(result).toContain("style");
      expect(result).toContain(".css");
      expect(result).toContain("abc123def456ghi789jkl012mno345pq");
      done();
    });
  });

  it("returns original path when view not in manifest", function (done) {
    var result;
    var template = "{{#cdn}}/missing.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toBe("/missing.css");
      done();
    });
  });

  it("returns CDN origin for interpolation", function (done) {
    var result;
    var template = "{{{cdn}}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toBe(config.cdn.origin);
      done();
    });
  });

  it("handles missing template gracefully", function (done) {
    this.request.template = null;
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toBe("/style.css");
      done();
    });
  });

  it("handles missing manifest gracefully", function (done) {
    this.request.template = {
      id: "SITE:blog",
      cdn: null,
    };
    var result;
    var template = "{{#cdn}}/style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toBe("/style.css");
      done();
    });
  });

  it("works without leading slash", function (done) {
    this.request.template.cdn["style.css"] = "abc123def456ghi789jkl012mno345pq";
    var result;
    var template = "{{#cdn}}style.css{{/cdn}}";

    cdn(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { cdn: lambda });
      expect(result).toContain(config.cdn.origin);
      expect(result).toContain("/template/");
      expect(result).toContain("style");
      expect(result).toContain(".css");
      expect(result).toContain("abc123def456ghi789jkl012mno345pq");
      done();
    });
  });
});

