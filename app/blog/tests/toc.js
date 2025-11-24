describe("table of contents support", function () {
  require("./util/setup")();

  async function enableToc(blog) {
    await blog.update({ flags: { toc: true } });
    await blog.rebuild();
  }

  it("exposes a generated TOC when enabled", async function () {
    await enableToc(this.blog);

    await this.write({
      path: "/post.txt",
      content: "# Title\n\n## Section one\n\nContent",
    });

    await this.template({ "entry.html": "{{{entry.toc}}}|||{{{entry.body}}}" });

    const [toc, body] = (await this.text("/post")).split("|||");

    expect(toc).toContain("id=\"TOC\"");
    expect(toc).toContain("Section one");
    expect(body).not.toContain("id=\"TOC\"");
  });

  it("leaves toc empty when disabled", async function () {
    await this.blog.update({ flags: { toc: false } });
    await this.blog.rebuild();

    await this.write({ path: "/no-toc.txt", content: "# Title\n\nText" });

    await this.template({ "entry.html": "{{entry.toc}}" });

    const body = (await this.text("/no-toc")).trim();

    expect(body).toBe("");
  });
});
