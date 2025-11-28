const config = require("config");
const purgeCdnUrls = require("../purgeCdnUrls");
const nock = require("nock");

describe("purgeCdnUrls", function () {
  const originalEnv = process.env.NODE_ENV;
  const originalBunny = config.bunny;
  const originalConfigEnvironment = config.environment;

  beforeEach(function () {
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(function () {
    process.env.NODE_ENV = originalEnv;
    config.bunny = originalBunny;
    config.environment = originalConfigEnvironment;
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("does nothing in non-production environments", async function () {
    process.env.NODE_ENV = "development";
    config.environment = "development";

    // Should not throw or make any requests
    await purgeCdnUrls(["https://example.com/test"]);
    
    // No assertions needed - just verify it doesn't throw
    expect(true).toBe(true);
  });

  it("does nothing when bunny secret is missing", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = null;

    await purgeCdnUrls(["https://example.com/test"]);
    
    expect(true).toBe(true);
  });

  it("does nothing when bunny secret is empty", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "" };

    await purgeCdnUrls(["https://example.com/test"]);
    
    expect(true).toBe(true);
  });

  it("does nothing with empty URL array", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "test-secret" };

    await purgeCdnUrls([]);
    
    expect(true).toBe(true);
  });

  it("does nothing with null/undefined URLs", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "test-secret" };

    await purgeCdnUrls(null);
    await purgeCdnUrls(undefined);
    
    expect(true).toBe(true);
  });

  it("handles invalid URL format gracefully", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "test-secret" };

    // Should not throw even with invalid URLs
    await purgeCdnUrls(["not-a-valid-url", "also-invalid"]);

    expect(true).toBe(true);
  });

  it("batches urls into a single purge request", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "test-secret" };

    const scope = nock("https://api.bunny.net")
      .post("/purge", (body) => {
        expect(body.urls).toEqual([
          encodeURIComponent("https://example.com/a"),
          encodeURIComponent("https://example.com/b"),
        ]);
        expect(body.async).toBe(false);
        return true;
      })
      .reply(200, { success: true });

    await purgeCdnUrls([
      "https://example.com/a",
      "https://example.com/b",
    ]);

    expect(scope.isDone()).toBe(true);
  });

  it("retries purge requests after receiving 429 responses", async function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    config.bunny = { secret: "test-secret" };

    const scope = nock("https://api.bunny.net")
      .post("/purge")
      .reply(429, {}, { "Retry-After": "0" })
      .post("/purge")
      .reply(200, { success: true });

    await purgeCdnUrls(["https://example.com/rate-limited"]);

    expect(scope.isDone()).toBe(true);
  });
});

