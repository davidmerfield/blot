describe("template design pattern catalog", function () {
  const Mustache = require("mustache");
  const catalog = require("./index");

  it("lists unique slugs and required fields", function () {
    const patterns = catalog.all();
    const slugs = patterns.map((pattern) => pattern.slug);

    expect(patterns.length).toBeGreaterThan(0);
    expect(slugs.length).toEqual(new Set(slugs).size);

    patterns.forEach((pattern) => {
      expect(catalog.validate(pattern)).toEqual([]);
      expect(pattern.slug).toMatch(/^[a-z0-9-]+$/);
      expect(catalog.get(pattern.slug)).toEqual(pattern);
    });
  });

  it("returns null for an unknown slug", function () {
    expect(catalog.get("does-not-exist")).toBeNull();
  });

  it("generates agent markdown that includes the HTML and CSS", function () {
    catalog.all().forEach((pattern) => {
      const markdown = catalog.toAgentMarkdown(pattern);
      expect(markdown).toContain("# Blot template design pattern: " + pattern.title);
      expect(markdown).toContain(pattern.html.trim());
      expect(markdown).toContain(pattern.css.trim());
      expect(markdown).toContain("/developers/patterns/" + pattern.slug);
      expect(markdown).toContain("Mustache");
    });
  });

  it("keeps Mustache snippets parseable", function () {
    catalog.all().forEach((pattern) => {
      expect(function () {
        Mustache.parse(pattern.html);
      }).not.toThrow();
    });
  });

  it("scopes demo CSS to the pattern demo wrapper", function () {
    const pattern = catalog.get("hamburger-navigation");
    const presented = catalog.present(pattern);
    expect(presented.demoCSS).toContain(
      ".pattern-demo--hamburger-navigation .site-header"
    );
    expect(presented.demoCSS).not.toMatch(/(^|})\s*\.site-header\s*\{/);
  });

  it("exposes JSON and catalog markdown for agents", function () {
    const pattern = catalog.get("tag-links");
    const json = catalog.toJSON(pattern);
    expect(json.markdownURL).toEqual("/developers/patterns/tag-links.md");
    expect(json.html).toContain("{{#tags}}");

    const catalogMarkdown = catalog.toCatalogMarkdown();
    expect(catalogMarkdown).toContain("hamburger-navigation");
    expect(catalogMarkdown).toContain("tag-links");
    expect(catalogMarkdown).toContain("details-disclosure");
    expect(catalogMarkdown).toContain("task-lists");
  });

  it("groups patterns by category without dropping any", function () {
    const grouped = catalog.grouped();
    const slugs = grouped.flatMap((group) =>
      group.patterns.map((pattern) => pattern.slug)
    );
    expect(slugs.sort()).toEqual(
      catalog
        .all()
        .map((pattern) => pattern.slug)
        .sort()
    );
  });
});
