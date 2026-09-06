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

  it("does not badge unsupported files inside a + folder as entries", async function () {
    await this.blog.write({ path: "/album+/one.md", content: "# One" });
    await this.blog.write({
      path: "/album+/archive.zip",
      content: "not really a zip",
    });
    await this.blog.rebuild();

    const $root = await this.parse(`/sites/${this.blog.handle}`);
    const folderHref = $root(".directory-list a")
      .filter(function () {
        return $root(this).text().includes("album+");
      })
      .first()
      .attr("href");

    const $folder = await this.parse(folderHref);

    const zipLink = $folder(".directory-list a")
      .filter(function () {
        return $folder(this).text().includes("archive.zip");
      })
      .first();
    expect(zipLink.length).toBe(1);
    expect(zipLink.find(".icon-file-check").length).toBe(0);
    expect(zipLink.hasClass("entry")).toBe(false);

    const mdLink = $folder(".directory-list a")
      .filter(function () {
        return $folder(this).text().includes("one.md");
      })
      .first();
    expect(mdLink.find(".icon-file-check").length).toBe(1);
  });

  it("does not treat an ordinary post containing data-file as a folder post", async function () {
    await this.blog.write({
      path: "/notes.html",
      content: '<h1>Notes</h1><pre data-file="example.js">code</pre>',
    });
    await this.blog.rebuild();

    const $file = await this.parse(
      `/sites/${this.blog.handle}/folder/notes.html`
    );

    expect($file(".publishing-steps").text()).toContain("File is a post");
    expect($file(".publishing-steps").text()).not.toContain("folder post");
    expect($file(".folder-post-summary").length).toBe(0);
  });
});
