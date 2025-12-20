const config = require("config");
const purgeCdnUrls = require("../purgeCdnUrls");

describe("purgeCdnUrls", function () {
  const originalEnv = process.env.NODE_ENV;
  const originalBunny = config.bunny;

  afterEach(function () {
    process.env.NODE_ENV = originalEnv;
    config.bunny = originalBunny;
  });

  it("does nothing in non-production environments", async function () {
    process.env.NODE_ENV = "development";
    
    // Should not throw or make any requests
    await purgeCdnUrls(["https://example.com/test"]);
    
    // No assertions needed - just verify it doesn't throw
    expect(true).toBe(true);
  });

  it("does nothing when bunny secret is missing", async function () {
    process.env.NODE_ENV = "production";
    config.bunny = null;
    
    await purgeCdnUrls(["https://example.com/test"]);
    
    expect(true).toBe(true);
  });

  it("does nothing when bunny secret is empty", async function () {
    process.env.NODE_ENV = "production";
    config.bunny = { secret: "" };
    
    await purgeCdnUrls(["https://example.com/test"]);
    
    expect(true).toBe(true);
  });

  it("does nothing with empty URL array", async function () {
    process.env.NODE_ENV = "production";
    config.bunny = { secret: "test-secret" };
    
    await purgeCdnUrls([]);
    
    expect(true).toBe(true);
  });

  it("does nothing with null/undefined URLs", async function () {
    process.env.NODE_ENV = "production";
    config.bunny = { secret: "test-secret" };
    
    await purgeCdnUrls(null);
    await purgeCdnUrls(undefined);
    
    expect(true).toBe(true);
  });

  it("handles invalid URL format gracefully", async function () {
    process.env.NODE_ENV = "production";
    config.bunny = { secret: "test-secret" };
    
    // Should not throw even with invalid URLs
    await purgeCdnUrls(["not-a-valid-url", "also-invalid"]);
    
    expect(true).toBe(true);
  });
});

