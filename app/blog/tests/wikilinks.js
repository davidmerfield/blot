describe("wikilinks", function () {
  require("./util/setup")();

  it("resolves embedded images after root file removal", async function () {
    const plugins = {
      ...this.blog.plugins,
      wikilinks: { enabled: true, options: {} },
    };

    await this.blog.update({ plugins });
    await this.blog.rebuild();

    const imageBuffer = await global.test.fake.pngBuffer();

    await this.write({ path: "/Image.jpg", content: imageBuffer });
    await this.remove("/Image.jpg");
    await this.write({ path: "/Images/Image.jpg", content: imageBuffer });

    await this.template({ "entry.html": "{{{entry.html}}}" });

    await this.write({
      path: "/post.txt",
      content: "Link: post\n\n![[Image.jpg]]",
    });

    const res = await this.get("/post");
    const body = await res.text();

    expect(res.status).toEqual(200);

    const match = body.match(/<img[^>]*src=\"([^\"]+)\"/i);

    expect(match).toBeTruthy();
    expect(match && match[1]).toEqual("/Images/Image.jpg");
  });
});
