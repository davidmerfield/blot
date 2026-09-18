describe("wordpress export", function () {
  global.test.site({ login: true });

  it("resolves %%BLOT_CDN%% tokens baked into entry HTML", async function () {
    const BLOT_CDN_TOKEN = require("blog/render/replaceFolderLinks/cdnToken");
    const config = require("config");

    await this.blog.write({ path: "/photo.jpg", content: "fake image data" });
    await this.blog.write({
      path: "/post.txt",
      content: "# Post\n\n![Image](photo.jpg)",
    });
    await this.blog.rebuild();

    const xml = await this.text(`/sites/${this.blog.handle}/export/wordpress`);

    expect(xml).not.toContain(BLOT_CDN_TOKEN);
    // Whether the image plugin optimized the image (_image_cache) or
    // folderAssets baked it, the export must hold a resolved CDN URL.
    expect(xml).toContain(config.cdn.origin);
  });
});
