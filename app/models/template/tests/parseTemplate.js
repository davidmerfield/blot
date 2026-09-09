describe("parseTemplate", function () {
  require("./setup")({ createTemplate: true });

  var parseTemplate = require("../parseTemplate");

  it("parses an empty template", function () {
    var template = "";
    var result = parseTemplate(template);
    expect(result).toEqual({ partials: {}, retrieve: {} });
  });

  it("parses partials from a template", function () {
    var template = `{{> foo}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: { foo: null },
      retrieve: {},
    });
  });

  it("resolves parsed entry partials to their canonical path", async function () {
    await this.set("/Pages/Home.txt", "Hello from home");
    var parsed = parseTemplate("{{> /pages/home.txt}}");
    var partials = await new Promise((resolve, reject) => {
      parseTemplate.resolveEntryPartials(
        this.blog.id,
        parsed.partials,
        function (err, result) {
          if (err) return reject(err);
          resolve(result);
        }
      );
    });

    expect(partials).toEqual({ "/Pages/Home.txt": null });
  });

  it("parses locals to retrieve from a template", function () {
    var template = `{{folder}}`; // folder is on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: true },
    });
  });

  it("includes locals that cannot be retrieved from a template", function () {
    var template = `{{xyz}}`; // not on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({ partials: {}, retrieve: { xyz: true } });
  });

  it("captures the root local used", function () {
    var template = `{{folder.length}}`; // folder is on the whitelist of variables
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: { length: true } },
    });
  });

  it("handles deeper nesting", function () {
    var template = `{{folder.subfolder.property}}`; // folder is on the whitelist
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: { subfolder: { property: true } } },
    });
  });

  it("handles both root and nested access", function () {
    var template = `{{folder}}{{folder.length}}`; // folder is on the whitelist
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { folder: { length: true } },
    });
  });

  it("tracks nested plugin assets", function () {
    var template = `{{{plugin.katex.css}}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { plugin: { katex: { css: true } } },
    });
  });

  it("records static CDN targets", function () {
    var template = `{{#cdn}}style.css{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { cdn: ["style.css"] },
    });
  });

  it("records static CDN targets with leading slashes", function () {
    var template = `{{#cdn}}/style.css{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { cdn: ["style.css"] },
    });
  });

  it("returns empty array for dynamic CDN targets", function () {
    var template = `{{#cdn}}/images/{{slug}}.png{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result.retrieve.cdn).toEqual([]);
  });

  it("preserves CDN array when both {{cdn}} interpolation and {{#cdn}} sections are present", function () {
    var template = `{{cdn}}/{{#cdn}}style.css{{/cdn}}`;
    var result = parseTemplate(template);
    expect(result.retrieve.cdn).toEqual(["style.css"]);
  });

  it("sets retrieve.cdn to empty array when only {{cdn}} interpolation is present", function () {
    var template = `{{cdn}}`;
    var result = parseTemplate(template);
    expect(result.retrieve.cdn).toEqual([]);
  });
});
