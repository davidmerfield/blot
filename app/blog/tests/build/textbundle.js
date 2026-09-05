describe("textbundle", function () {
  require("../util/setup")();

  const fs = require("fs-extra");

  it("handle textbundle files correctly", async function () {
    await this.template({
      "entries.html": "{{#entries}}{{title}}{{/entries}}",
      "entry.html": "{{{entry.html}}}",
    });

    const copy = (path) =>
      this.write({ path, content: fs.readFileSync(__dirname + path) });

    await copy("/Title.textbundle/info.json");
    await copy("/Title.textbundle/text.md");
    await copy("/Title.textbundle/assets/14F9B183.jpeg");

    // Importantly, this confirms the image inside the assets subdirectory did
    // not become its own post – only the markdown file was published
    expect(await this.text("/")).toEqual("Title");

    const result = await this.text("/title");

    expect(result).toContain('<h1 id="title">Title</h1>');
    expect(result).toContain(
      '<a href="https://example.com" title="Link">link</a>'
    );
    expect(result).toContain("<em>text</em>");
    expect(result).toContain("<table>");
    expect(result).toContain('<span class="katex">');
    // Blot resolved the image correctly
    expect(result).toContain(
      `<img src="https://cdn.localhost/${this.blog.id}/_image_cache/`
    );
    expect(result).toContain('<section id="footnotes"');
  });
});
