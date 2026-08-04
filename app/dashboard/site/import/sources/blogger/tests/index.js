const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const blogger = require("../index");

describe("Blogger importer", function () {
  const fixture = path.join(__dirname, "fixtures", "export.xml");

  it("selects published posts and pages and maps Atom fields", async function () {
    const entries = await blogger.parse(await fs.readFile(fixture, "utf8"));
    expect(entries.length).toBe(4);
    expect(entries.map(({ id }) => id)).toEqual(["post-1", "page-1", "post-2", "post-3"]);
    expect(entries[0].tags).toEqual(["News", "Two Words"]);
    expect(entries[0].html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(entries[0].permalink).toBe("https://example.blogspot.com/2020/01/shared.html");
    expect(entries[0].dateStamp).toBe(Date.parse("2020-01-02T03:04:05Z"));
    expect(entries[1].page).toBe(true);
    expect(entries[2].title).toBe("shared");
    expect(entries[2].slug).toBe("2020-01-shared-2");
    expect(entries[3].slug).toBe("a-☃-weird.name");
  });

  it("writes Markdown, metadata, pages, and collision-safe paths", async function () {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "blogger-import-"));
    await blogger(fixture, output, () => {});

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
});
