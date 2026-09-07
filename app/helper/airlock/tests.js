describe("helper/airlock", function () {
  const nock = require("nock");
  const config = require("config");
  const airlockPath = require.resolve("helper/airlock");

  const original = {
    required: config.airlock.required,
    proxy: config.airlock.proxy,
    browser_url: config.airlock.browser_url,
  };

  // The module reads config.airlock at require time, so each spec sets the
  // state it wants and re-requires a fresh copy.
  const load = ({ required, proxy, browser_url } = {}) => {
    config.airlock.required = !!required;
    config.airlock.proxy = proxy || null;
    config.airlock.browser_url = browser_url || null;
    delete require.cache[airlockPath];
    return require("helper/airlock");
  };

  beforeEach(function () {
    nock.disableNetConnect();
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
    config.airlock.required = original.required;
    config.airlock.proxy = original.proxy;
    config.airlock.browser_url = original.browser_url;
    delete require.cache[airlockPath];
  });

  it("is a no-op when not required and nothing is configured", function () {
    const airlock = load({ required: false });
    expect(airlock.required).toBe(false);
    expect(airlock.proxyConfigured).toBe(false);
    expect(airlock.proxyAgent).toBeUndefined();
    expect(function () {
      airlock.assertProxyReady("test");
    }).not.toThrow();
    expect(function () {
      airlock.assertBrowserReady("test");
    }).not.toThrow();
  });

  it("throws from assertProxyReady when required but proxy is unset", function () {
    const airlock = load({ required: true });
    expect(function () {
      airlock.assertProxyReady("some-sink");
    }).toThrowError(/some-sink/);
  });

  it("throws from assertBrowserReady when required but browser_url is unset", function () {
    const airlock = load({ required: true });
    expect(function () {
      airlock.assertBrowserReady("linkScreenshot");
    }).toThrowError(/linkScreenshot/);
  });

  it("does not throw when required and the airlock is configured", function () {
    const airlock = load({
      required: true,
      proxy: "http://airlock:8888",
      browser_url: "http://airlock:9222",
    });
    expect(airlock.assertProxyReady("x")).toBeUndefined();
    expect(airlock.assertBrowserReady("x")).toBeUndefined();
  });

  it("picks an https proxy agent for https targets and http for http", function () {
    const airlock = load({ proxy: "http://airlock:8888" });
    const httpsAgent = airlock.proxyAgent({ protocol: "https:" });
    const httpAgent = airlock.proxyAgent({ protocol: "http:" });
    expect(httpsAgent).toBeTruthy();
    expect(httpAgent).toBeTruthy();
    expect(httpsAgent).not.toBe(httpAgent);
    expect(httpsAgent.constructor.name).toBe("HttpsProxyAgent");
    expect(httpAgent.constructor.name).toBe("HttpProxyAgent");
  });

  it("fetch() rejects instead of fetching when required but proxy is unset", async function () {
    const airlock = load({ required: true });
    const scope = nock("http://example.com").get("/").reply(200, "ok");
    let threw;
    try {
      await airlock.fetch("http://example.com/");
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeDefined();
    expect(threw.message).toMatch(/BLOT_AIRLOCK_PROXY_URL/);
    expect(scope.isDone()).toBe(false);
  });

  it("fetch() does a direct request when not required and unconfigured", async function () {
    const airlock = load({ required: false });
    const scope = nock("http://example.com").get("/").reply(200, "ok");
    const res = await airlock.fetch("http://example.com/");
    expect(res.status).toBe(200);
    expect(scope.isDone()).toBe(true);
  });
});
