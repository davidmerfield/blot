describe("wikilinks", function () {
  require("./util/setup")();

  global.test.timeout(10 * 1000);// 10 second timeout

  async function enableWikilinks() {
    const plugins = {
      ...this.blog.plugins,
      wikilinks: { enabled: true, options: {} },
    };

    await this.template({ "entry.html": "{{{entry.html}}}" });
    await this.blog.update({ plugins });
    await this.blog.rebuild();
  }

  beforeEach(async function () {
    await enableWikilinks.call(this);
  });

  it("resolves embedded images after root file removal", async function () {
    const imageBuffer = await global.test.fake.pngBuffer();

    await this.write({ path: "/Image.jpg", content: imageBuffer });
    await this.blog.rebuild();

    await this.remove("/Image.jpg");
    await this.blog.rebuild();

    await this.write({ path: "/Images/Image.jpg", content: imageBuffer });
    await this.blog.rebuild();

    await this.write({
      path: "/post.txt",
      content: "Link: post\n\n![[Image.jpg]]",
    });
    await this.blog.rebuild();

    const res = await this.get("/post");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('/_image_cache/');
    expect(body).not.toContain('"/Image.jpg"');
  });

  it("renders unresolved wikilinks without altering their href", async function () {
    await this.write({
      path: "/Missing.md",
      content: [
        "Title: Missing",
        "Link: missing",
        "",
        "See [[Nonexistent Note]].",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/missing");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="Nonexistent Note"'); // Missing targets keep original href
    expect(body).toContain(">Nonexistent Note<");
  });

  it("resolves wikilinks by path for relative, absolute, and parent lookups", async function () {
    await this.write({
      path: "/Fruits/Apple.md",
      content: [
        "Title: Apple",
        "Link: fruits/apple",
        "",
        "# Apple",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Fruits/Pear.txt",
      content: [
        "Title: Pear",
        "Link: fruits/pear",
        "",
        "# Pear",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Fruits/Tasty/Mango.md",
      content: [
        "Title: Mango",
        "Link: fruits/tasty/mango",
        "",
        "# Mango",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Introduction.md",
      content: [
        "Title: Introduction",
        "Link: introduction",
        "",
        "[[Fruits/Apple]]",
        "",
        "[[./Fruits/Pear]]",
        "",
        "[[/Fruits/Tasty/Mango.md]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Fruits/Tasty/Notes.md",
      content: [
        "Title: Mango Notes",
        "Link: fruits/tasty/notes",
        "",
        "[[../Apple]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const introRes = await this.get("/introduction");
    const introBody = await introRes.text();

    expect(introRes.status).toEqual(200);
    expect(introBody).toContain('href="/fruits/apple"'); // relative path resolves via byPath
    expect(introBody).toContain(">Apple<");
    expect(introBody).toContain('href="/fruits/pear"'); // ./ relative path resolves via byPath
    expect(introBody).toContain(">Pear<");
    expect(introBody).toContain('href="/fruits/tasty/mango"'); // absolute vault path resolves via byPath
    expect(introBody).toContain(">Mango<");

    const mangoRes = await this.get("/fruits/tasty/notes");
    const mangoBody = await mangoRes.text();

    expect(mangoRes.status).toEqual(200);
    expect(mangoBody).toContain('href="/fruits/apple"'); // ../ parent traversal resolves via byPath
    expect(mangoBody).toContain(">Apple<");
  });

  it("resolves filename-only wikilinks by traversing sibling directories", async function () {
    await this.write({
      path: "/Fruits/Tasty/Mango.md",
      content: [
        "Title: Mango",
        "Link: fruits/tasty/mango",
        "",
        "# Mango",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Fruits/Apple.md",
      content: [
        "Title: Apple",
        "Link: fruits/apple",
        "",
        "[[Mango]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/fruits/apple");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="/fruits/tasty/mango"'); // filename search finds Mango in sibling directory
    expect(body).toContain(">Mango<");
  });

  it("falls back to title lookup when path and filename searches fail", async function () {
    await this.write({
      path: "/Plans/Roadmap.md",
      content: [
        "Title: Project Plan",
        "Link: plans/project-plan",
        "",
        "# Overview",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Plans/Notes.md",
      content: [
        "Title: Planning Notes",
        "Link: plans/notes",
        "",
        "[[Project Plan]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/plans/notes");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="/plans/project-plan"'); // byTitle resolves when path & filename miss
    expect(body).toContain(">Project Plan<");
  });

  it("links to same-page headings for all supported anchor syntaxes", async function () {
    await this.write({
      path: "/Headings.md",
      content: [
        "Title: Heading Demo",
        "Link: headings",
        "",
        "# Heading Demo",
        "",
        "## Custom Heading",
        "",
        "Links: [[Heading Demo]] [[#Heading Demo]] [[custom-heading]] [[#custom-heading]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/headings");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="#heading-demo"'); // matches [[Heading Demo]]
    expect(body).toContain('href="#custom-heading"'); // matches [[custom-heading]] variations
    expect(body).toMatch(/>Heading Demo<.*>Heading Demo</s); // heading text reused for both forms
    expect(body).toMatch(/>Custom Heading<.*>Custom Heading</s);
  });

  it("prefers entry matches over same-page headings unless explicitly anchored", async function () {
    await this.write({
      path: "/References/Label.md",
      content: [
        "Title: Label Entry",
        "Link: references/label",
        "",
        "# Label Entry",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/References/Overview.md",
      content: [
        "Title: Reference Overview",
        "Link: references/overview",
        "",
        "## Label",
        "",
        "Links: [[Label]] and [[#Label]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/references/overview");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="/references/label"'); // [[Label]] prefers entry lookup
    expect(body).toContain(">Label Entry<");
    expect(body).toContain('href="#label"'); // [[#Label]] links to heading anchor
    expect(body).toContain(">Label<");
  });

  it("prefers filename matches over competing title lookups", async function () {
    await this.write({
      path: "/Notes/Trips/Sunrise.md",
      content: [
        "Title: Mountain Sunrise",
        "Link: notes/trips/sunrise",
        "",
        "# Summit",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Notes/Drafts/Dawn.md",
      content: [
        "Title: Sunrise",
        "Link: notes/drafts/dawn",
        "",
        "# Draft",
      ].join("\n"),
    });
    await this.blog.rebuild();

    await this.write({
      path: "/Notes/Guides/Tour.md",
      content: [
        "Title: Tour Guide",
        "Link: notes/guides/tour",
        "",
        "[[Sunrise]]",
      ].join("\n"),
    });
    await this.blog.rebuild();

    const res = await this.get("/notes/guides/tour");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain('href="/notes/trips/sunrise"'); // filename match wins ahead of title match
    expect(body).toContain(">Mountain Sunrise<");
    expect(body).not.toContain('href="/notes/drafts/dawn"');
  });
});
