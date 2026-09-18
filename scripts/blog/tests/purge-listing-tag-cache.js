const fs = require("fs");
const path = require("path");
const {
  inspectListingView,
  inspectListingViews,
  parseArgs,
  summarizeHits,
  hitsNeedTags,
  hitsNeedBacklinks,
  blogURL,
} = require("../purge-listing-tag-cache");

function loadSourcePartials(slug) {
  const dir = path.join(__dirname, "../../../app/templates/source", slug);
  const partials = {};

  fs.readdirSync(dir).forEach(function (entry) {
    if (entry === "package.json" || entry[0] === ".") return;
    const content = fs.readFileSync(path.join(dir, entry), "utf8");
    let viewName = entry;
    if (viewName[0] === "_") viewName = viewName.slice(1);
    partials[viewName] = content;
    partials[viewName.replace(/\.(html|mustache)$/i, "")] = content;
  });

  return partials;
}

function inspectSourceListing(slug, viewName) {
  const partials = loadSourcePartials(slug);
  const content = partials[viewName] || partials[viewName.replace(/\.html$/, "")];
  return inspectListingView(content, partials);
}

describe("purge-listing-tag-cache inspectListingView", function () {
  it("flags tags rendered inside {{#entries}}, the original report", function () {
    expect(
      inspectListingView(
        "{{#entries}}{{title}} in {{#tags}} {{name}} {{/tags}}{{/entries}}",
        {}
      )
    ).toEqual(["tags"]);
  });

  it("flags tags rendered inside {{#posts}}", function () {
    expect(
      inspectListingView(
        "{{#posts}}{{#tags}}<a href='/tagged/{{slug}}'>{{tag}}</a>{{/tags}}{{/posts}}",
        {}
      )
    ).toEqual(["tags"]);
  });

  it("flags tags.length as a tags reference", function () {
    expect(
      inspectListingView("{{#posts}}{{#tags.length}}tagged{{/tags.length}}{{/posts}}", {})
    ).toEqual(["tags"]);
  });

  it("flags inverted {{^tags}} inside a listing loop", function () {
    expect(inspectListingView("{{#posts}}{{^tags}}untagged{{/tags}}{{/posts}}", {})).toEqual(
      ["tags"]
    );
  });

  it("flags backlinks on listing entries", function () {
    expect(
      inspectListingView(
        "{{#posts}}{{#backlinks}}{{title}}{{/backlinks}}{{/posts}}",
        {}
      )
    ).toEqual(["backlinks"]);
  });

  it("flags entry.tagged lookups inside a listing loop", function () {
    expect(
      inspectListingView("{{#posts}}{{#tagged.Reviews}}review{{/tagged.Reviews}}{{/posts}}", {})
    ).toEqual(["tagged"]);
  });

  it("flags tags inside a partial included from {{#posts}}", function () {
    expect(
      inspectListingView("{{#posts}}{{> row}}{{/posts}}", {
        row: "{{#tags}}{{name}}{{/tags}}",
      })
    ).toEqual(["tags"]);
  });

  it("resolves partials stored as row.html when the include is {{> row}}", function () {
    expect(
      inspectListingView("{{#posts}}{{> row}}{{/posts}}", {
        "row.html": "{{#tags}}{{name}}{{/tags}}",
      })
    ).toEqual(["tags"]);
  });

  it("does not flag page-level {{#tags}} in a head partial outside the listing loop", function () {
    expect(
      inspectListingView("{{> head}}{{#posts}}{{title}}{{/posts}}", {
        head: "{{#tags}}<meta content='{{name}}'>{{/tags}}",
      })
    ).toEqual([]);
  });

  it("does not treat tagged.html's page-level {{#tagged}} wrapper as an entry field", function () {
    expect(
      inspectListingView("{{#tagged}}{{tag}}{{#entries}}{{title}}{{/entries}}{{/tagged}}", {})
    ).toEqual([]);
  });

  it("does flag tags on entries nested under tagged.html's {{#tagged}}{{#entries}}", function () {
    expect(
      inspectListingView(
        "{{#tagged}}{{tag}}{{#entries}}{{#tags}}{{name}}{{/tags}}{{/entries}}{{/tagged}}",
        {}
      )
    ).toEqual(["tags"]);
  });

  it("flags {{#tagged.entries}} as a listing loop", function () {
    expect(
      inspectListingView("{{#tagged.entries}}{{#tags}}{{name}}{{/tags}}{{/tagged.entries}}", {})
    ).toEqual(["tags"]);
  });

  it("flags search_results the same way as posts", function () {
    expect(
      inspectListingView(
        "{{#search_results}}{{#tags}}{{name}}{{/tags}}{{/search_results}}",
        {}
      )
    ).toEqual(["tags"]);
  });

  it("does not flag all_tags", function () {
    expect(
      inspectListingView("{{#all_tags}}{{name}}{{/all_tags}}{{#posts}}{{title}}{{/posts}}", {})
    ).toEqual([]);
  });

  it("returns every augmented field used in the view", function () {
    expect(
      inspectListingView(
        "{{#posts}}{{#tags}}{{name}}{{/tags}}{{#backlinks}}{{title}}{{/backlinks}}{{/posts}}",
        {}
      )
    ).toEqual(["backlinks", "tags"]);
  });

  it("survives a circular partial include", function () {
    expect(
      inspectListingView("{{#posts}}{{> a}}{{/posts}}", {
        a: "{{> b}}",
        b: "{{> a}}{{#tags}}{{name}}{{/tags}}",
      })
    ).toEqual(["tags"]);
  });

  it("returns an empty list for unparseable content", function () {
    expect(inspectListingView("{{#posts}}{{#unterminated", {})).toEqual([]);
  });
});

describe("purge-listing-tag-cache inspectListingViews", function () {
  it("reports which listing view used which field", function () {
    expect(
      inspectListingViews({
        "entries.html": {
          content: "{{#posts}}{{#tags}}{{name}}{{/tags}}{{/posts}}",
          partials: {},
        },
        "tagged.html": {
          content: "{{#entries}}{{title}}{{/entries}}",
          partials: {},
        },
        "search.html": {
          content: "{{#entries}}{{#backlinks}}{{title}}{{/backlinks}}{{/entries}}",
          partials: {},
        },
      })
    ).toEqual([
      { view: "entries.html", field: "tags" },
      { view: "search.html", field: "backlinks" },
    ]);
  });

  it("skips missing listing views", function () {
    expect(inspectListingViews({})).toEqual([]);
  });
});

describe("purge-listing-tag-cache helpers", function () {
  it("parses --purge, --yes, and an identifier in any order", function () {
    expect(parseArgs(["node", "script", "--purge", "example", "--yes"])).toEqual({
      flags: { purge: true, yes: true, help: false },
      identifier: "example",
    });
  });

  it("defaults to a dry run with no identifier", function () {
    expect(parseArgs(["node", "script"])).toEqual({
      flags: { purge: false, yes: false, help: false },
      identifier: undefined,
    });
  });

  it("rejects unknown flags", function () {
    expect(function () {
      parseArgs(["node", "script", "--force"]);
    }).toThrowError("Unknown flag: --force");
  });

  it("parses --help", function () {
    expect(parseArgs(["node", "script", "--help"]).flags.help).toBe(true);
  });

  it("summarizes hits by view", function () {
    expect(
      summarizeHits([
        { view: "search.html", field: "tags" },
        { view: "entries.html", field: "backlinks" },
        { view: "entries.html", field: "tags" },
      ])
    ).toEqual("entries.html:backlinks,tags search.html:tags");
  });

  it("knows which hits require a tag index check", function () {
    expect(hitsNeedTags([{ view: "entries.html", field: "tags" }])).toBe(true);
    expect(hitsNeedTags([{ view: "entries.html", field: "tagged" }])).toBe(true);
    expect(hitsNeedTags([{ view: "entries.html", field: "backlinks" }])).toBe(
      false
    );
    expect(hitsNeedBacklinks([{ view: "entries.html", field: "backlinks" }])).toBe(
      true
    );
  });

  it("prefers the custom domain for the blog URL", function () {
    expect(blogURL({ domain: "example.com", handle: "foo" }, "blot.im")).toEqual(
      "https://example.com"
    );
    expect(blogURL({ handle: "foo" }, "blot.im")).toEqual("https://foo.blot.im");
  });
});

describe("purge-listing-tag-cache against official template source", function () {
  it("detects tags on zine, notebook, blog, magazine, and text listing views", function () {
    expect(inspectSourceListing("zine", "entries.html")).toEqual(["tags"]);
    expect(inspectSourceListing("notebook", "entries.html")).toEqual(["tags"]);
    expect(inspectSourceListing("blog", "entries.html")).toEqual(["tags"]);
    expect(inspectSourceListing("magazine", "entries.html")).toEqual(["tags"]);
    expect(inspectSourceListing("text", "entries.html")).toEqual(["tags"]);
  });

  it("detects backlinks on hypertext listing views", function () {
    expect(inspectSourceListing("hypertext", "entries.html")).toEqual(["backlinks"]);
  });

  it("does not flag listing views that only show titles", function () {
    expect(inspectSourceListing("wireframe", "entries.html")).toEqual([]);
    expect(inspectSourceListing("studio", "entries.html")).toEqual([]);
  });
});
