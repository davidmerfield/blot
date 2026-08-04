const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const blogger = require("../index");

describe("Blogger importer", function () {
  const legacyFixture = path.join(__dirname, "fixtures", "export.xml");
  const atomFixture = path.join(__dirname, "fixtures", "export.atom");

  it("selects published posts and pages and maps Atom fields", async function () {
    const entries = await blogger.parse(await fs.readFile(legacyFixture, "utf8"));
    expect(entries.length).toBe(5);
    expect(entries.map(({ id }) => id)).toEqual([
      "post-1",
      "page-1",
      "post-2",
      "post-3",
      "post-4",
    ]);
    expect(entries[0].tags).toEqual(["News", "Two Words"]);
    expect(entries[0].html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(entries[0].permalink).toBe("https://example.blogspot.com/2020/01/shared.html");
    expect(entries[0].dateStamp).toBe(Date.parse("2020-01-02T03:04:05Z"));
    expect(entries[1].page).toBe(true);
    expect(entries[2].title).toBe("shared");
    expect(entries[2].slug).toBe("2020-01-shared-2");
    expect(entries[3].slug).toBe("a-☃-weird.name");
    expect(entries[4].title).toBe("hello-world");
    expect(entries[4].slug).toBe("2020-01-hello-world");
  });

  it("parses current Blogger Atom exports with blogger:type and filename", async function () {
    const entries = await blogger.parse(await fs.readFile(atomFixture, "utf8"));
    expect(entries.length).toBe(3);
    expect(entries.map(({ id }) => id)).toEqual([
      "tag:blogger.com,1999:blog-1.post-1",
      "tag:blogger.com,1999:blog-1.page-1",
      "tag:blogger.com,1999:blog-1.post-2",
    ]);
    expect(entries[0].permalink).toBe("/2014/07/kinship-terms.html");
    expect(entries[0].slug).toBe("2014-07-kinship-terms");
    expect(entries[0].dateStamp).toBe(Date.parse("2014-07-28T03:35:00Z"));
    expect(entries[0].html).toContain("<strong>world</strong>");
    expect(entries[1].page).toBe(true);
    expect(entries[1].slug).toBe("p-about");
    expect(entries[2].title).toBe("kion-fari");
    expect(entries[2].slug).toBe("2021-11-kion-fari");
  });

  it("writes Markdown, metadata, pages, and collision-safe paths", async function () {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "blogger-import-"));
    await blogger(legacyFixture, output, () => {});

    const first = await fs.readFile(path.join(output, "2020", "01-02-2020-01-shared.txt"), "utf8");
    const duplicate = path.join(output, "2020", "01-02-2020-01-shared-2.txt");
    const page = await fs.readFile(path.join(output, "Pages", "p-about.txt"), "utf8");
    expect(first).toContain("Tags: News, Two Words");
    expect(first).toContain("Link: https://example.blogspot.com/2020/01/shared.html");
    expect(first).toContain("Hello **world**.");
    expect(await fs.pathExists(duplicate)).toBe(true);
    expect(page).toContain("# About");
    await fs.remove(output);
  });

  it("writes Markdown from current Atom exports using blogger:filename paths", async function () {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "blogger-atom-import-"));
    await blogger(atomFixture, output, () => {});

    const post = await fs.readFile(
      path.join(output, "2014", "07-28-2014-07-kinship-terms.txt"),
      "utf8"
    );
    const page = await fs.readFile(path.join(output, "Pages", "p-about.txt"), "utf8");
    expect(post).toContain("Link: /2014/07/kinship-terms.html");
    expect(post).toContain("Hello **world**.");
    expect(page).toContain("# About");
    expect(page).toContain("Link: /p/about.html");
    await fs.remove(output);
  });
});
