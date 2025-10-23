describe("encodeXML", function () {
  var encodeXML = require("blog/render/retrieve/encodeXML");
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
    var template = "{{#encodeXML}}" + html + "{{/encodeXML}}";

    encodeXML(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { encodeXML: lambda });
      expect(result).toEqual('<a href="http://example.com/foo"></a>');
      done();
    });
  });

  it("removes invalid characters", function (done) {
    var result;
    var locals = {};
    var html = "& foo &#xFF08;&#x4FBF;&#x5229;";
    var template = "{{#encodeXML}}" + html + "{{/encodeXML}}";

    encodeXML(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { encodeXML: lambda });
      expect(result).toEqual("&amp; foo （便利");
      done();
    });
  });

  it("removes script tags", function (done) {
    var result;
    var locals = {};
    var html = "<script>alert('foo');</script><p>Hey</p>";
    var template = "{{#encodeXML}}" + html + "{{/encodeXML}}";

    encodeXML(this.request, {}, function (err, lambda) {
      result = mustache.render(template, { encodeXML: lambda });
      expect(result).toEqual("<p>Hey</p>");
      done();
    });
  });
});
