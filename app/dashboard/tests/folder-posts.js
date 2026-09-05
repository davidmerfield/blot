describe("folder posts in the dashboard", function () {
  global.test.site({ login: true });

  it("shows a checkmark on plus folders and lists source files", async function () {
    await this.blog.write({ path: "/album+/one.md", content: "# One" });
    await this.blog.write({ path: "/album+/two.md", content: "# Two" });
    await this.blog.rebuild();

    const $root = await this.parse(`/sites/${this.blog.handle}`);
    const folderLink = $root(".directory-list a")
      .filter(function () {
        return $root(this).text().includes("album+");
      })
      .first();

    expect(folderLink.length).toBe(1);
    expect(folderLink.find(".icon-folder-check").length).toBe(1);

    const $file = await this.parse(
      `/sites/${this.blog.handle}/folder/album+/one.md`
    );

    expect($file(".publishing-steps").text()).toContain(
      "This file is part of a folder post"
    );
    expect($file(".folder-post-files").text()).toContain("one.md");
    expect($file(".folder-post-files").text()).toContain("two.md");
    expect($file(".folder-post-file.current .file-name").text()).toContain(
      "one.md"
    );
  });

  it("builds folder posts whose names contain brackets", async function () {
    await this.blog.write({
      path: "/[Blog]+/hello.md",
      content: "# Hello from brackets",
    });
    await this.blog.rebuild();

    const $root = await this.parse(`/sites/${this.blog.handle}`);
    const folderLink = $root(".directory-list a")
      .filter(function () {
        return $root(this).text().includes("[Blog]+");
      })
      .first();

    expect(folderLink.length).toBe(1);
    expect(folderLink.find(".icon-folder-check").length).toBe(1);

    const href = folderLink.attr("href");
    expect(href).toBeDefined();

    const $folder = await this.parse(href);
    const fileLink = $folder(".directory-list a")
      .filter(function () {
        return $folder(this).text().includes("hello.md");
      })
      .first();

    expect(fileLink.length).toBe(1);

    const $file = await this.parse(fileLink.attr("href"));
    expect($file(".publishing-steps").text()).toContain(
      "This file is part of a folder post"
    );
    expect($file.text()).toContain("Hello from brackets");
  });
});
