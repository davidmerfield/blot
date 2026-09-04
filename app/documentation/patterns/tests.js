describe("template design pattern catalog", function () {
  const Mustache = require("mustache");
  const catalog = require("./index");

  const EXPECTED_SLUGS = [
    "site-menu-bar",
    "hamburger-navigation",
    "pagination",
    "adjacent-posts",
    "archives-by-month",
    "archives-chronological",
    "search-form",
    "tag-links",
    "backlinks",
    "details-disclosure",
    "task-lists",
    "code-copy-button",
    "heading-permalinks",
    "relative-dates",
    "keyboard-adjacent",
  ];

  it("lists unique slugs and required fields", function () {
    const patterns = catalog.all();
    const slugs = patterns.map((pattern) => pattern.slug);

    expect(patterns.length).toBeGreaterThan(0);
    expect(slugs.length).toEqual(new Set(slugs).size);
    expect(slugs.sort()).toEqual(EXPECTED_SLUGS.slice().sort());

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
      if (pattern.js) {
        expect(markdown).toContain("## JavaScript");
        expect(markdown).toContain(pattern.js.trim());
      } else {
        expect(markdown).not.toContain("## JavaScript");
      }
    });
  });

  it("keeps Mustache snippets parseable", function () {
    catalog.all().forEach((pattern) => {
      expect(function () {
        Mustache.parse(pattern.html);
      }).not.toThrow();
      if (pattern.js && pattern.js.includes("{{")) {
        expect(function () {
          Mustache.parse(pattern.js);
        }).not.toThrow();
      }
    });
  });

  it("keeps live demos free of Mustache and script tags", function () {
    catalog.all().forEach((pattern) => {
      expect(pattern.demoHTML).not.toMatch(/\{\{/);
      expect(pattern.demoHTML).not.toMatch(/<script/i);
    });
  });

  it("keeps demo links on-page so the documentation crawler does not 404", function () {
    catalog.all().forEach((pattern) => {
      const hrefs = Array.from(pattern.demoHTML.matchAll(/\bhref="([^"]*)"/g)).map(
        (match) => match[1]
      );
      hrefs.forEach((href) => {
        expect(href === "#" || href.startsWith("#")).toBe(true);
      });
    });
  });

  it("points tag links at /tagged/{{slug}} without an extra entry wrapper", function () {
    const pattern = catalog.get("tag-links");
    expect(pattern.html).toContain('href="/tagged/{{slug}}"');
    expect(pattern.html).not.toContain("{{{url}}}");
    expect(pattern.html).not.toMatch(/\{\{#entry\}\}/);
    expect(pattern.guidance).toContain("do **not** have a `url` field");
    expect(pattern.guidance).toContain("/tagged/{{slug}}");
  });

  it("collapses the hamburger only on small screens and hides clipped links from tab order", function () {
    const css = catalog.get("hamburger-navigation").css;
    expect(css).toContain("@media (max-width: 40em)");
    expect(css).toContain("visibility: hidden");
    expect(css).toMatch(
      /\.nav-toggle:checked\s*~\s*\.site-header\s+\.site-nav[\s\S]*visibility:\s*visible/
    );
  });

  it("applies disclosure CSS classes in the Markdown sample", function () {
    const markdown = catalog.get("details-disclosure").markdown;
    expect(markdown).toContain('class="disclosure"');
    expect(markdown).toContain('class="disclosure-body"');
  });

  it("scopes demo CSS to the pattern demo wrapper", function () {
    const pattern = catalog.get("hamburger-navigation");
    const presented = catalog.present(pattern);
    expect(pattern.css).toContain("@media (max-width: 40em)");
    expect(presented.demoCSS).toContain(
      ".pattern-demo--hamburger-navigation .site-header"
    );
    expect(presented.demoCSS).not.toMatch(/(^|})\s*\.site-header\s*\{/);
    expect(presented.demoCSS).toContain("@container (max-width: 40em)");
    expect(presented.demoCSS).not.toContain("@media (max-width: 40em)");
    expect(presented.demoCSS).toMatch(
      /@container \(max-width: 40em\)[\s\S]*\.pattern-demo--hamburger-navigation \.site-nav/
    );
    expect(presented.demoCSS).not.toMatch(
      /@container \(max-width: 40em\)\s*\{\s*\.site-header\s*\{/
    );
  });

  it("wraps demo JavaScript so it only runs inside the demo", function () {
    const pattern = catalog.get("code-copy-button");
    const presented = catalog.present(pattern);
    expect(presented.hasJS).toBe(true);
    expect(presented.jsHighlighted).toContain("addCopyButtons");
    expect(presented.demoScriptTag).toContain(".pattern-demo--code-copy-button");
    expect(presented.demoScriptTag).toContain("if (!root) return");
    expect(catalog.toJSON(pattern).js).toContain("addCopyButtons");
    expect(catalog.toAgentMarkdown(pattern)).not.toContain("demoJS");
  });

  it("exposes JSON and catalog markdown for agents", function () {
    const pattern = catalog.get("tag-links");
    const json = catalog.toJSON(pattern);
    expect(json.markdownURL).toEqual("/developers/patterns/tag-links.md");
    expect(json.html).toContain("{{#tags}}");
    expect(json.js).toBeNull();

    const catalogMarkdown = catalog.toCatalogMarkdown();
    EXPECTED_SLUGS.forEach((slug) => {
      expect(catalogMarkdown).toContain(slug);
    });
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

  it("resolves related pattern slugs", function () {
    catalog.all().forEach((pattern) => {
      (pattern.related || []).forEach((slug) => {
        expect(catalog.get(slug)).not.toBeNull();
      });
    });
  });
});
