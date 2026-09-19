describe("documentation when redis is unavailable", function () {
  const config = require("config");
  const client = require("models/client");
  const { ClientOfflineError } = require("redis");

  global.test.site();
  global.test.timeout(5 * 60 * 1000);

  // The proxy caches 400s for a year but never 503s, so an outage must
  // never surface as a 400 on the documentation.
  it("responds 503, not a cacheable 400, when a route cannot reach redis", async function () {
    spyOn(client, "get").and.rejectWith(new ClientOfflineError());

    const res = await this.fetch(
      config.protocol + config.host + "/news/confirm/abc"
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("Temporarily unavailable");
  });
});
