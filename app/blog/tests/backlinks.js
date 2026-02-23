describe("backlinks", function () {
  require("./util/setup")();

  const backlinksTemplate = {
    "entry.html":
      "{{#entry}}{{#backlinks.length}}Backlinks: {{#backlinks}}{{title}}{{/backlinks}}{{/backlinks.length}}{{/entry}}",
  };

  it("renders backlinks when another post links via markdown", async function () {
    await this.write({ path: "/target.txt", content: "Title: Target\n\nContent." });
    await this.write({
      path: "/linker.txt",
      content: "Title: Linker\n\n[see target](/target)",
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/target");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain("Backlinks:");
    expect(body).toContain("Linker");
  });

  it("renders backlinks when another post links via wikilinks", async function () {
    await this.write({ path: "/first.txt", content: "Foo" });
    await this.write({
      path: "/second.txt",
      content: "Title: Second\n\n[[first]]",
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/first");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain("Backlinks:");
    expect(body).toContain("Second");
  });

  it("renders multiple backlinks when several posts link to the same entry", async function () {
    await this.write({
      path: "/target.txt",
      content: "Title: Target\n\nContent.",
    });
    await this.write({
      path: "/linker-a.txt",
      content: "Title: Linker A\n\n[target](/target)",
    });
    await this.write({
      path: "/linker-b.txt",
      content: "Title: Linker B\n\n[target](/target)",
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/target");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain("Backlinks:");
    expect(body).toContain("Linker A");
    expect(body).toContain("Linker B");
  });

  it("renders no backlinks when nothing links to the entry", async function () {
    await this.write({
      path: "/standalone.txt",
      content: "Title: Standalone\n\nNo one links here.",
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/standalone");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).not.toContain("Backlinks:");
  });


  it("resolves backlinks from double-encoded href values", async function () {
    await this.write({
      path: "/target.txt",
      content: "Title: Target\nLink: /a%2520b\n\nContent.",
    });
    await this.write({
      path: "/linker.txt",
      content:
        'Title: Linker\n\n<p><a href="/a%2520b">Link to target</a></p>',
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/a%2520b");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain("Backlinks:");
    expect(body).toContain("Linker");
  });

  it("renders backlinks when the linked page has umlauts (ä, ü, ö) in its URL", async function () {
    // Page with umlaut in URL (explicit Link so the URL is /grüße)
    await this.write({
      path: "/grüße.txt",
      content: "Title: Grüße\nLink: /grüße\n\nContent here.",
    });
    // Link using raw HTML with percent-encoded href. This simulates output from
    // converters (e.g. Pandoc) that encode unicode in URLs; internalLinks
    // then sees "/gr%C3%BC%C3%9Fe" and getByUrl must resolve it to the entry
    // stored under decoded "/grüße" or the backlink is never added.
    await this.write({
      path: "/linker.txt",
      content:
        'Title: Linker\n\n<p><a href="/gr%C3%BC%C3%9Fe">Link to page</a></p>',
    });
    await this.template(backlinksTemplate);

    const res = await this.get("/grüße");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toContain("Backlinks:");
    expect(body).toContain("Linker");
  });
});
