describe("tagged block", function () {
  require("blog/tests/util/setup")();

  it("lists entries for a single tag", async function () {
    await this.write({
      path: "/first.txt",
      content: "Title: First\nTags: foo\n\nFirst body",
    });
    await this.write({
      path: "/second.txt",
      content: "Title: Second\nTags: foo\n\nSecond body",
    });
    await this.write({
      path: "/other.txt",
      content: "Title: Other\nTags: bar\n\nOther body",
    });

    await this.template({
      "tagged.html": `<ul>{{#tagged}}{{#entries}}<li>{{title}}</li>{{/entries}}{{/tagged}}</ul>`,
    });

    const res = await this.get("/tagged/foo");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("<ul><li>Second</li><li>First</li></ul>");
  });

  it("keeps existing tagged behavior when path_prefix is not set", async function () {
    await this.write({
      path: "/blog/one.txt",
      content: "Title: One\nTags: foo\n\nOne body",
    });
    await this.write({
      path: "/notes/two.txt",
      content: "Title: Two\nTags: foo\n\nTwo body",
    });

    await this.template({
      "tagged.html": `<ul>{{#tagged}}{{#entries}}<li>{{title}}</li>{{/entries}}{{/tagged}}</ul>`,
    });

    const res = await this.get("/tagged/foo");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("<ul><li>Two</li><li>One</li></ul>");
  });

  it("exposes metadata and helpers for the current tag", async function () {
    await this.write({ path: "/a.txt", content: "Tags: Featured\n\nAlpha" });

    await this.template({
      "tagged.html": `{{#tagged}}{{tag}}|{{#tagged.Featured}}upper{{/tagged.Featured}}|{{#tagged.featured}}lower{{/tagged.featured}}|{{#is.featured}}alias{{/is.featured}}{{/tagged}}`,
    });

    const res = await this.get("/tagged/Featured");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("Featured|upper|lower|alias");
  });

  it("filters entries by the intersection of multiple tags", async function () {
    await this.write({
      path: "/one.txt",
      content: "Title: One\nTags: foo\n\nOne body",
    });
    await this.write({
      path: "/two.txt",
      content: "Title: Two\nTags: foo, bar\n\nTwo body",
    });
    await this.write({
      path: "/three.txt",
      content: "Title: Three\nTags: bar\n\nThree body",
    });
    await this.write({
      path: "/four.txt",
      content: "Title: Four\nTags: foo, bar\n\nFour body",
    });

    await this.template({
      "entries.html": `<p>{{#tagged}}{{tag}}:{{#entries}}{{title}}|{{/entries}}{{/tagged}}</p>`,
    });

    const res = await this.get("/?tag=foo&tag=bar");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("<p>foo + bar:Four|Two|</p>");
  });

  it("filters tagged entries by path_prefix", async function () {
    await this.write({
      path: "/blog/one.txt",
      content: "Title: One\nTags: foo\n\nOne body",
    });
    await this.write({
      path: "/notes/two.txt",
      content: "Title: Two\nTags: foo\n\nTwo body",
    });
    await this.write({
      path: "/blog/three.txt",
      content: "Title: Three\nTags: foo\n\nThree body",
    });

    await this.template(
      {
        "tagged.html": `<ul>{{#tagged}}{{#entries}}<li>{{title}}</li>{{/entries}}{{/tagged}}</ul>`,
      },
      {
        locals: {
          path_prefix: "/blog/",
        },
      }
    );

    const res = await this.get("/tagged/foo");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("<ul><li>Three</li><li>One</li></ul>");
  });

  it("paginates tagged entries using filtered totals when path_prefix is set", async function () {
    await this.write({
      path: "/blog/one.txt",
      content: "Title: One\nTags: foo\n\nOne body",
    });
    await this.write({
      path: "/blog/two.txt",
      content: "Title: Two\nTags: foo\n\nTwo body",
    });
    await this.write({
      path: "/notes/three.txt",
      content: "Title: Three\nTags: foo\n\nThree body",
    });

    await this.template(
      {
        "tagged.html": `{{#tagged}}{{total}}|{{pagination.total}}|{{pagination.current}}|{{#entries}}{{title}}{{/entries}}{{/tagged}}`,
      },
      {
        locals: {
          path_prefix: "/blog/",
          tagged_page_size: 1,
        },
      }
    );

    const res = await this.get("/tagged/foo/page/2");
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body.trim()).toEqual("2|2|2|One");
  });
});
