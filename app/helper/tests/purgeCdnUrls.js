const config = require("config");

function loadPurgeCdnUrlsWithFetch(fetchMock) {
  delete require.cache[require.resolve("../purgeCdnUrls")];
  delete require.cache[require.resolve("node-fetch")];
  require.cache[require.resolve("node-fetch")] = { exports: fetchMock };
  // eslint-disable-next-line global-require
  return require("../purgeCdnUrls");
}

describe("purgeCdnUrls", function () {
  const originalEnv = process.env.NODE_ENV;
  const originalConfigEnv = config.environment;
  const originalBunny = config.bunny;
  let purgeCdnUrls;
  let fetchMock;
  let originalSetTimeout;
  let originalDateNow;
  let delayCalls;
  let currentTime;

  beforeEach(function () {
    process.env.NODE_ENV = "production";
    config.environment = "production";
    fetchMock = jasmine.createSpy("fetch");
    purgeCdnUrls = loadPurgeCdnUrlsWithFetch(fetchMock);
    delayCalls = [];
    originalSetTimeout = global.setTimeout;
    originalDateNow = Date.now;
    currentTime = 0;

    global.setTimeout = (fn, ms) => {
      delayCalls.push(ms);
      currentTime += ms;
      return originalSetTimeout(fn, 0);
    };

    Date.now = () => currentTime;
  });

  afterEach(function () {
    process.env.NODE_ENV = originalEnv;
    config.environment = originalConfigEnv;
    config.bunny = originalBunny;
    delete require.cache[require.resolve("../purgeCdnUrls")];
    delete require.cache[require.resolve("node-fetch")];
    global.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  });

  it("does nothing in non-production environments", async function () {
    process.env.NODE_ENV = "development";
    config.environment = "development";
    config.bunny = { secret: "test-secret" };

    await purgeCdnUrls(["https://example.com/test"]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when bunny secret is missing", async function () {
    config.bunny = null;

    await purgeCdnUrls(["https://example.com/test"]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when bunny secret is empty", async function () {
    config.bunny = { secret: "" };

    await purgeCdnUrls(["https://example.com/test"]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing with empty URL array", async function () {
    config.bunny = { secret: "test-secret" };

    await purgeCdnUrls([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries on 429 before succeeding", async function () {
    config.bunny = { secret: "test-secret" };
    let attempts = 0;

    fetchMock.and.callFake(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: () => null },
        });
      }

      return Promise.resolve({ status: 200, headers: { get: () => null } });
    });

    const purgePromise = purgeCdnUrls(["https://example.com/test"]);
    await purgePromise;

    expect(fetchMock.calls.count()).toBe(2);
    expect(delayCalls).toContain(1000);
  });

  it("honors Retry-After header when rate limited", async function () {
    config.bunny = { secret: "test-secret" };
    let attempts = 0;

    fetchMock.and.callFake(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve({
          status: 429,
          headers: { get: (key) => (key === "Retry-After" ? "5" : null) },
        });
      }

      return Promise.resolve({ status: 200, headers: { get: () => null } });
    });

    const purgePromise = purgeCdnUrls(["https://example.com/test"]);
    await purgePromise;

    expect(fetchMock.calls.count()).toBe(2);
    expect(delayCalls).toContain(5000);
  });

  it("stops after max retries on repeated 429s", async function () {
    config.bunny = { secret: "test-secret" };

    fetchMock.and.returnValue(
      Promise.resolve({ status: 429, headers: { get: () => null } })
    );

    const purgePromise = purgeCdnUrls(["https://example.com/test"]);
    await purgePromise;

    expect(fetchMock.calls.count()).toBe(6);
    expect(delayCalls).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("throttles requests between URLs", async function () {
    config.bunny = { secret: "test-secret", requestsPerSecond: 10 };

    fetchMock.and.returnValue(
      Promise.resolve({ status: 200, headers: { get: () => null } })
    );

    const purgePromise = purgeCdnUrls([
      "https://example.com/one",
      "https://example.com/two",
    ]);
    await purgePromise;

    expect(fetchMock.calls.count()).toBe(2);
    expect(delayCalls).toContain(100);
  });
});

