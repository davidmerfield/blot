const nock = require("nock");
const safeDownload = require("../safe_download");

const publicLookup = (_hostname, _options, callback) =>
  callback(null, [{ address: "93.184.216.34", family: 4 }]);
const privateLookup = (_hostname, _options, callback) =>
  callback(null, [{ address: "10.0.0.2", family: 4 }]);

async function expectFailure(promise, pattern) {
  try {
    await promise;
    fail("Expected download to fail");
  } catch (error) {
    expect(error.message).toMatch(pattern);
  }
}

describe("safe_download", function () {
  afterEach(function () {
    nock.cleanAll();
  });

  it("rejects direct private IP addresses", async function () {
    await expectFailure(safeDownload("http://127.0.0.1/image.png"), /non-public/);
    await expectFailure(safeDownload("http://[::1]/image.png"), /non-public/);
  });

  it("rejects hostnames resolving to private addresses", async function () {
    await expectFailure(safeDownload("https://example.com/image.png", { lookup: privateLookup }), /non-public/);
  });

  it("validates a redirect destination before requesting it", async function () {
    nock("http://example.com").get("/start").reply(302, "", { Location: "http://10.0.0.1/secret" });
    await expectFailure(safeDownload("http://example.com/start", { lookup: publicLookup, contentTypes: ["image/"] }), /non-public/);
  });

  it("rejects unsupported schemes and URL credentials", async function () {
    await expectFailure(safeDownload("file:///etc/passwd"), /Unsupported/);
    await expectFailure(safeDownload("https://user:pass@example.com/a"), /credentials/);
  });

  it("stops streaming responses which exceed the size cap", async function () {
    nock("http://example.com").get("/large").reply(200, Buffer.alloc(11), { "Content-Type": "image/png" });
    await expectFailure(safeDownload("http://example.com/large", { lookup: publicLookup, maxSize: 10, contentTypes: ["image/"] }), /maximum size/);
  });

  it("aborts requests after the timeout", async function () {
    nock("http://example.com").get("/slow").delayConnection(100).reply(200, "image", { "Content-Type": "image/png" });
    await expectFailure(safeDownload("http://example.com/slow", { lookup: publicLookup, timeout: 10, contentTypes: ["image/"] }), /timed out/);
  });

  it("downloads valid public images and PDFs", async function () {
    nock("http://example.com").get("/image").reply(200, "image", { "Content-Type": "image/png" });
    nock("http://example.com").get("/document").reply(200, "%PDF", { "Content-Type": "application/pdf" });
    const image = await safeDownload("http://example.com/image", { lookup: publicLookup, contentTypes: ["image/"] });
    const pdf = await safeDownload("http://example.com/document", { lookup: publicLookup, contentTypes: ["application/pdf"] });
    expect(image.data.toString()).toBe("image");
    expect(pdf.data.toString()).toBe("%PDF");
  });
});
