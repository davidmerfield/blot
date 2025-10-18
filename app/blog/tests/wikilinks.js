describe("wikilinks", function () {
  require("./util/setup")();

  global.test.timeout(10 * 1000);// 10 second timeout
  
  it("resolves embedded images after root file removal", async function () {
    const plugins = {
      ...this.blog.plugins,
      wikilinks: { enabled: true, options: {} },
    };

    await this.template({ "entry.html": "{{{entry.html}}}" });
    await this.blog.update({ plugins });
    await this.blog.rebuild();

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
});
