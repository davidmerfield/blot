describe("absoluteURLs", function () {
  var absoluteURLs = require("blog/render/retrieve/absoluteURLs");
  var mustache = require("mustache");

  global.test.blog();

  beforeEach(function () {
    this.request = {
      protocol: "http",
      get: function () {
        return "example.com";
      },
    };
  });

  it("replaces relative links with absolute URLs", function (done) {
    var result;
    var locals = {};
    var html = '<a href="/foo"></a>';
    var template = "{{#absoluteURLs}}" + html + "{{/absoluteURLs}}";

    absoluteURLs(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { absoluteURLs: lambda });
      expect(result).toEqual('<a href="http://example.com/foo"></a>');
      done();
    });
  });

  it("replaces relative image sources with absolute sources", function (done) {
    var result;
    var locals = {};
    var html = '<img src="/bar.jpg">';
    var template = "{{#absoluteURLs}}" + html + "{{/absoluteURLs}}";

    absoluteURLs(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { absoluteURLs: lambda });
      expect(result).toEqual('<img src="http://example.com/bar.jpg">');
      done();
    });
  });

  it("leaves fully qualified links and images as-is", function (done) {
    var result;
    var locals = {};
    var html =
      '<a href="http://example.com/foo"><img src="http://example.com/bar.jpg"></a>';
    var template = "{{#absoluteURLs}}" + html + "{{/absoluteURLs}}";

    absoluteURLs(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { absoluteURLs: lambda });
      expect(result).toEqual(html);
      done();
    });
  });
});
