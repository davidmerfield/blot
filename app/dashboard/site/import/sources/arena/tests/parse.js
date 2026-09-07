const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const parse = require("../parse");

describe("Are.na text block importer", function () {
  let outputDirectory;

  beforeEach(function () {
    outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-import-"));
  });

  afterEach(function () {
    fs.removeSync(outputDirectory);
  });

  function block(overrides) {
    return Object.assign(
      {
        id: 123,
        class: "Text",
        title: "A text block",
        content:
          '<p>Hello <strong>world</strong>. Visit <a href="https://example.com">Example</a>.</p>',
        visibility: "public",
        created_at: "2020-04-05T06:07:08.000Z",
        updated_at: "2021-05-06T07:08:09.000Z",
      },
      overrides
    );
  }

  it("converts formatted HTML and preserves timestamps and source metadata", async function () {
    const item = block({ description: "A useful description" });
    await parse({ outputDirectory, posts: [item], status: function () {} });

    const destination = path.join(
      outputDirectory,
      "2020",
      "04-05-A-text-block.txt"
    );
    const content = fs.readFileSync(destination, "utf8");
    expect(content).toContain("Date: 2020-04-05");
    expect(content).toContain("Link: https://www.are.na/block/123");
    expect(content).toContain("Summary: A useful description");
    expect(content).toContain("Hello **world**.");
    expect(content).toContain("[Example](https://example.com)");
    const normalized = parse.normalizeText(item);
    expect(normalized.dateStamp).toBe(Date.parse(item.created_at));
    expect(normalized.created).toBe(Date.parse(item.created_at));
    expect(normalized.updated).toBe(Date.parse(item.updated_at));
  });

  it("places private blocks in Drafts and applies both title fallbacks", async function () {
    await parse({
      outputDirectory,
      status: function () {},
      posts: [
        block({ id: 1, title: "", generated_title: "Generated", visibility: "private" }),
        block({ id: 2, title: "", generated_title: "", created_at: "2020-04-06T00:00:00Z" }),
      ],
    });

    expect(fs.existsSync(path.join(outputDirectory, "Drafts", "Generated.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outputDirectory, "2020", "04-06-Untitled.txt"))).toBe(true);
  });

  it("uses stable suffixes for duplicate titles", async function () {
    await parse({
      outputDirectory,
      status: function () {},
      posts: [block({ content: "first" }), block({ id: 456, content: "second" })],
    });

    const directory = path.join(outputDirectory, "2020");
    expect(fs.readFileSync(path.join(directory, "04-05-A-text-block.txt"), "utf8")).toContain("first");
    expect(fs.readFileSync(path.join(directory, "04-05-A-text-block-2.txt"), "utf8")).toContain("second");
  });

  it("reports unsupported and malformed blocks, then imports later blocks", async function () {
    const statuses = [];
    spyOn(console, "error");
    await parse({
      outputDirectory,
      status: (message) => statuses.push(message),
      posts: [
        { id: 10, class: "Attachment", title: "Unsupported" },
        block({ id: 11, title: "Malformed", content: undefined }),
        block({ id: 12, title: "Still imported", content: "Success" }),
      ],
    });

    expect(statuses.some((message) => message.includes("Cannot process Are.na block Unsupported"))).toBe(true);
    expect(statuses.some((message) => message.includes("Failed to process Are.na block Malformed"))).toBe(true);
    expect(fs.readFileSync(path.join(outputDirectory, "2020", "04-05-Still-imported.txt"), "utf8")).toContain("Success");
  });
});

describe("Are.na image block importer", function () {
  const nock = require("nock");
  let outputDirectory;

  function imageBlock(url, overrides) {
    return Object.assign(
      {
        id: 1,
        class: "Image",
        title: "My picture",
        visibility: "public",
        created_at: "2020-04-05T06:07:08.000Z",
        image: { filename: "photo.png", original: { url } },
      },
      overrides
    );
  }

  beforeEach(function () {
    outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arena-image-"));
    nock.disableNetConnect();
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
    fs.removeSync(outputDirectory);
  });

  it("downloads an image from are.na's CloudFront host", async function () {
    const scope = nock("https://d2w9rnfcy7mm78.cloudfront.net")
      .get("/1/original_abc.png")
      .reply(200, Buffer.from("PNGBYTES"));

    await parse({
      outputDirectory,
      status: function () {},
      posts: [
        imageBlock(
          "https://d2w9rnfcy7mm78.cloudfront.net/1/original_abc.png"
        ),
      ],
    });

    expect(scope.isDone()).toBe(true);
    const written = fs.readdirSync(outputDirectory);
    expect(written.length).toBe(1);
    expect(fs.readFileSync(path.join(outputDirectory, written[0]), "utf8")).toBe(
      "PNGBYTES"
    );
  });

  ["http://169.254.169.254/latest/meta-data/", "https://evil.example/x.png", "https://d2w9rnfcy7mm78.cloudfront.net.evil.example/x.png"].forEach(
    (url) => {
      it("refuses non-are.na image URL " + url, async function () {
        const statuses = [];
        spyOn(console, "error");

        await parse({
          outputDirectory,
          status: (message) => statuses.push(message),
          posts: [imageBlock(url)],
        });

        expect(
          statuses.some((m) => m.includes("Refusing to download non-are.na image URL"))
        ).toBe(true);
        expect(fs.readdirSync(outputDirectory).length).toBe(0);
      });
    }
  );

  it("does not follow a redirect off the are.na host", async function () {
    const scope = nock("https://d2w9rnfcy7mm78.cloudfront.net")
      .get("/1/original_abc.png")
      .reply(302, "", { Location: "http://169.254.169.254/" });
    const statuses = [];
    spyOn(console, "error");

    await parse({
      outputDirectory,
      status: (message) => statuses.push(message),
      posts: [
        imageBlock(
          "https://d2w9rnfcy7mm78.cloudfront.net/1/original_abc.png"
        ),
      ],
    });

    expect(scope.isDone()).toBe(true);
    expect(statuses.some((m) => m.includes("Failed to process"))).toBe(true);
    expect(fs.readdirSync(outputDirectory).length).toBe(0);
  });
});
