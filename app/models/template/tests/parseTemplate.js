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



  it("projects fields from allEntries section access", function () {
    var template = `{{#allEntries}}{{title}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { title: true } } },
    });
  });

  it("merges allEntries section field access with direct property access", function () {
    var template = `{{#allEntries}}{{title}}{{/allEntries}}{{allEntries.url}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { title: true, url: true } } },
    });
  });



  it("handles nested sections inside allEntries without leaking nested fields as top-level locals", function () {
    var template = `{{#allEntries}}{{#thumbnail}}{{large}}{{/thumbnail}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { thumbnail: true } } },
    });
  });

  it("handles inverted sections inside allEntries", function () {
    var template = `{{#allEntries}}{{^more}}Read more{{/more}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { more: true } } },
    });
  });


  it("tracks non-system locals in allEntries context", function () {
    var template = `{{#allEntries}}{{siteTitle}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { siteTitle: true } }, siteTitle: true },
    });
  });

  it("tracks camelCase locals in allEntries context", function () {
    var template = `{{#allEntries}}{{publishedAt}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { publishedAt: true } }, publishedAt: true },
    });
  });

  it("tracks non-system locals in nested allEntries field context", function () {
    var template = `{{#allEntries}}{{#thumbnail}}{{siteTitle}}{{/thumbnail}}{{/allEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { allEntries: { fields: { thumbnail: true } }, siteTitle: true },
    });
  });

  it("projects fields from all_entries section access", function () {
    var template = `{{#all_entries}}{{title}}{{/all_entries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { all_entries: { fields: { title: true } } },
    });
  });

  it("projects fields from recentEntries section access", function () {
    var template = `{{#recentEntries}}{{title}}{{/recentEntries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { recentEntries: { fields: { title: true } } },
    });
  });

  it("projects fields from recent_entries section access", function () {
    var template = `{{#recent_entries}}{{title}}{{/recent_entries}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { recent_entries: { fields: { title: true } } },
    });
  });

  it("projects fields from posts section access", function () {
    var template = `{{#posts}}{{title}}{{/posts}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { posts: { fields: { title: true } } },
    });
  });

  it("projects fields from search_results section access", function () {
    var template = `{{#search_results}}{{title}}{{/search_results}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { search_results: { fields: { title: true } } },
    });
  });

  it("projects fields from tagged entries access", function () {
    var template = `{{#tagged.entries}}{{title}}{{/tagged.entries}}{{tagged.entries.url}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { tagged: { fields: { title: true, url: true } } },
    });
  });

  it("projects fields from archives entries access", function () {
    var template = `{{#archives}}{{#months}}{{#entries}}{{title}}{{/entries}}{{/months}}{{/archives}}{{archives.months.entries.url}}`;
    var result = parseTemplate(template);
    expect(result).toEqual({
      partials: {},
      retrieve: { archives: { fields: { title: true, url: true } } },
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
