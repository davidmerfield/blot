describe("rebuild", function () {
  // Set up a test blog before each test
  global.test.blog();

  it("will rebuild entries on blog", async function () {
    const path = "/Hello.txt";

    await this.blog.write({ path, content: "Title: Hello" });
    await this.blog.rebuild();
    await this.blog.check({ path, title: "Hello" });

    await this.blog.write({ path, content: "Title: Bye" });
    await this.blog.rebuild();
    await this.blog.check({ path, title: "Bye" });

  });

  it("will rebuild cached images on blog", async function () {
    const path = "/Hello.txt";

    await this.blog.write({ path, content: "![](_image.png)" });
    await this.blog.write({
      path: "/_image.png",
      content: await global.test.fake.pngBuffer(),
    });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain("/_image_cache/");

    await this.blog.rebuild({ imageCache: true });

    const rebuiltEntry = await this.blog.check({ path });

    expect(rebuiltEntry.html).not.toEqual(entry.html);
    expect(entry.thumbnail).toEqual(rebuiltEntry.thumbnail);

  });

  it("will rebuild entries with dependent files", async function () {
    const path = "/Posts/Hello.txt";

    await this.blog.write({ path, content: "![Image](/Public/image.png)" });
    await this.blog.write({
      path: "/Public/image.png",
      content: await global.test.fake.pngBuffer(),
    });

    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.dependencies).toEqual(["/Public/image.png"]);

    await this.blog.rebuild();
    await this.blog.check({ path });

  });

  it("will rebuild thumbnails on blog", async function () {
    const path = "/Hello.txt";

    await this.blog.write({ path, content: "![](_image.png)" });
    await this.blog.write({
      path: "/_image.png",
      content: await global.test.fake.pngBuffer(),
    });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain("/_image_cache/");

    await this.blog.rebuild({ thumbnails: true });

    const rebuiltEntry = await this.blog.check({ path });

    expect(rebuiltEntry.html).toEqual(entry.html);
    expect(entry.thumbnail).not.toEqual(rebuiltEntry.thumbnail);

  });
});
