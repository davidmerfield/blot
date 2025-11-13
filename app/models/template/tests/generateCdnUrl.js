describe("template", function () {
  require("./setup")();

  const config = require("config");
  const generateCdnUrl = require("../util/generateCdnUrl");

  it("generates a CDN URL for a simple view", function () {
    const url = generateCdnUrl("style.css", "abcdef0123456789");

    expect(url).toBe(
      `${config.cdn.origin}/template/style.abcdef0123456789.css`
    );
  });

  it("URI-encodes nested view paths", function () {
    const url = generateCdnUrl("partials/Header Images/main.scss", "1234abcd");

    expect(url).toBe(
      `${config.cdn.origin}/template/partials/Header%20Images/main.1234abcd.scss`
    );
  });

  it("handles view names without an extension", function () {
    const url = generateCdnUrl("robots", "feedface");

    expect(url).toBe(`${config.cdn.origin}/template/robots.feedface`);
  });

  it("throws for invalid arguments", function () {
    expect(() => generateCdnUrl("", "hash")).toThrowError(
      /viewName must be a non-empty string/
    );

    expect(() => generateCdnUrl("style.css", "")).toThrowError(
      /hash must be a non-empty string/
    );
  });
});

