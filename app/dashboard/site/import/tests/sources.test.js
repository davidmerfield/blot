const fs = require("fs-extra");
const path = require("path");
const arena = require("../sources/arena");
const blogger = require("../sources/blogger");
const wordpress = require("../sources/wordpress");
const { createDirectories, fixture, fixtureFile, inspectFiles, mockHTTP, restoreHTTP } = require("./utilities");

describe("active import sources", function () {
  let directories;
  beforeEach(async () => (directories = await createDirectories()));
  afterEach(async () => {
    await directories.cleanup();
    restoreHTTP();
  });

  async function rejection(promise, message) {
    try {
      await promise;
      fail("Expected promise to reject");
    } catch (error) {
      if (message) expect(error.message).toContain(message);
    }
  }

  it("converts representative Blogger and WordPress fixtures", async function () {
    const bloggerInput = await fixtureFile("blogger-minimal.xml", directories.input);
    await blogger(bloggerInput, directories.output, () => {});
    expect(Object.keys(await inspectFiles(directories.output))).toHaveLength(1);

    const wordpressInput = await fixtureFile("wordpress-minimal.xml", directories.input);
    await new Promise((resolve, reject) => wordpress(wordpressInput, directories.output, () => {}, {}, (error) => error ? reject(error) : resolve()));
    expect(Object.values(await inspectFiles(directories.output)).join("\n")).toContain("Hello world");
  });

  it("rejects malformed input and Blogger exports without entries", async function () {
    const malformed = path.join(directories.input, "malformed.xml");
    await fs.writeFile(malformed, "<not-xml");
    await rejection(blogger(malformed, directories.output, () => {}));
    await fs.writeFile(malformed, "<?xml version=\"1.0\"?><feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>");
    await rejection(blogger(malformed, directories.output, () => {}), "No published posts");
  });

  it("converts Are.na links, rejects empty channels, and preserves failed images", async function () {
    const nock = mockHTTP();
    const channel = JSON.parse(await fixture("arena-channel.json"));
    const contents = JSON.parse(await fixture("arena-contents.json"));
    nock("https://api.are.na").get("/v2/channels/example").reply(200, channel).get(/\/v2\/channels\/example\/contents.*/).reply(200, contents);
    await arena({ slug: "example", outputDirectory: directories.output, status: () => {} });
    expect(Object.keys(await inspectFiles(directories.output))).toContain("2024-01-02 Example link.webloc");

    nock("https://api.are.na").get("/v2/channels/empty").reply(200, channel).get(/\/v2\/channels\/empty\/contents.*/).reply(200, { contents: [] });
    await rejection(arena({ slug: "empty", outputDirectory: directories.output, status: () => {} }), "No importable items");

    nock("https://api.are.na").get("/v2/channels/images").reply(200, channel).get(/\/v2\/channels\/images\/contents.*/).reply(200, { contents: [{ class: "Image", title: "Remote image", created_at: "2024-01-02T03:04:05Z", visibility: "public", image: { filename: "remote.jpg", original: { url: "https://assets.example/remote.jpg" } } }] });
    nock("https://assets.example").get("/remote.jpg").reply(503);
    await arena({ slug: "images", outputDirectory: directories.output, status: () => {} });
    expect(Object.values(await inspectFiles(directories.output)).join("\n")).toContain("https://assets.example/remote.jpg");
  });
});
