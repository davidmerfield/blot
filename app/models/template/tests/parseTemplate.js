describe("parseTemplate", function () {
  require("./setup")({ createTemplate: true });

  var parseTemplate = require("../parseTemplate");

  it("parses an empty template", function () {
    var template = "";
    var result = parseTemplate(template);
    expect(result).toEqual({ partials: {}, retrieve: {}, cdnTargets: [] });
  });

  it("parses partials from a template", function () {
    var template = `{{> foo}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: { foo: null },
      retrieve: {},
      cdnTargets: [],
    });
  });

  it("parses locals to retrieve from a template", function () {
    var template = `{{folder}}`; // folder is on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: true },
      cdnTargets: [],
    });
  });

  it("ignores locals that cannot be retrieved from a template", function () {
    var template = `{{xyz}}`; // not on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({ partials: {}, retrieve: {}, cdnTargets: [] });
  });

  it("captures the root local used", function () {
    var template = `{{folder.length}}`; // not on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: true },
      cdnTargets: [],
    });
  });

  it("records static CDN targets", function () {
    var template = `{{#cdn}}style.css{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { cdn: true },
      cdnTargets: ["style.css"],
    });
  });

    it("records static CDN targets with leading slashes", function () {
    var template = `{{#cdn}}/style.css{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { cdn: true },
      cdnTargets: ["style.css"],
    });
  });

  it("ignores dynamic CDN targets", function () {
    var template = `{{#cdn}}/images/{{slug}}.png{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result.cdnTargets).toEqual([]);
  });
});
