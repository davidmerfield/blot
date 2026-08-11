const dns = require("dns");
const fs = require("fs").promises;
const nock = require("nock");
const download = require("..");

describe("secure image downloader", function () {
  const publicAddress = { address: "93.184.216.34", family: 4 };

  beforeEach(function () {
    spyOn(dns.promises, "lookup").and.callFake(async hostname => {
      if (hostname === "private.test") return [{ address: "10.0.0.4", family: 4 }];
      return [publicAddress];
    });
  });

  afterEach(function () {
    nock.cleanAll();
  });

  function get (url, headers) {
    return new Promise(resolve => {
      download(url, headers || {}, (error, path, responseHeaders) => {
        resolve({ error, path, headers: responseHeaders });
      });
    });
  }

  it("rejects direct private IPv4 and IPv6 destinations", async function () {
    expect((await get("http://127.0.0.1/image.png")).error).toBeTruthy();
    expect((await get("http://[fd00::1]/image.png")).error).toBeTruthy();
  });

  it("rejects hostnames whose DNS answers include a private address", async function () {
    expect((await get("http://private.test/image.png")).error.message).toContain("non-public");
  });

  it("rejects IPv4-mapped IPv6 destinations", async function () {
    expect((await get("http://[::ffff:127.0.0.1]/image.png")).error).toBeTruthy();
  });

  it("validates a redirect destination before requesting it", async function () {
    nock("http://public.test").get("/start").reply(302, "", { Location: "http://private.test/image.png" });
    const result = await get("http://public.test/start");
    expect(result.error.message).toContain("non-public");
  });

  it("follows relative redirects and allows a public destination", async function () {
    nock("http://public.test").get("/start").reply(302, "", { Location: "/image.png" });
    nock("http://public.test").get("/image.png").reply(200, "image");
    const result = await get("http://public.test/start");
    expect(result.error).toBeNull();
    expect(await fs.readFile(result.path, "utf8")).toBe("image");
    await fs.unlink(result.path);
  });

  it("enforces the redirect limit", async function () {
    const scope = nock("http://public.test");
    for (let i = 0; i <= download.MAX_REDIRECTS; i++) {
      scope.get("/" + i).reply(302, "", { Location: "/" + (i + 1) });
    }
    expect((await get("http://public.test/0")).error.message).toContain("Maximum redirects");
  });

  it("does not forward validators to an unrelated origin", async function () {
    nock("http://public.test").get("/start").matchHeader("if-none-match", "secret").reply(302, "", {
      Location: "http://other.test/image.png"
    });
    nock("http://other.test").get("/image.png").matchHeader("if-none-match", value => value === undefined).reply(200, "image");
    const result = await get("http://public.test/start", { etag: "secret" });
    expect(result.error).toBeNull();
    await fs.unlink(result.path);
  });
});
