describe("template", function () {
  require("./setup")();

  const config = require("config");
  const generateCdnUrl = require("../util/generateCdnUrl");

  it("generates a CDN URL for a simple view", function () {
    const hash = "abcdef0123456789abcdef0123456789";
    const url = generateCdnUrl("style.css", hash);

    expect(url).toBe(
      `${config.cdn.origin}/template/ab/cd/ef0123456789abcdef0123456789/style.css`
    );
  });

  it("generates a CDN URL with nested view paths (uses original filename)", function () {
    const hash = "1234abcd5678ef901234abcd5678ef90";
    const url = generateCdnUrl("partials/Header Images/main.scss", hash);

    // Format: /template/{hash[0:2]}/{hash[2:4]}/{hash[4:]}/{viewName}
    // Uses original filename including path
    expect(url).toBe(
      `${config.cdn.origin}/template/12/34/abcd5678ef901234abcd5678ef90/partials/Header Images/main.scss`
    );
  });

  it("handles view names without an extension", function () {
    const hash = "feedface1234567890feedface12345678";
    const url = generateCdnUrl("robots", hash);

    expect(url).toBe(`${config.cdn.origin}/template/fe/ed/face1234567890feedface12345678/robots`);
  });

  it("throws for invalid arguments", function () {
    expect(() => generateCdnUrl("", "hash")).toThrowError(
      /viewName must be a non-empty string/
    );

    expect(() => generateCdnUrl("style.css", "")).toThrowError(
      /hash must be a non-empty string with at least 4 characters/
    );

    expect(() => generateCdnUrl("style.css", "abc")).toThrowError(
      /hash must be a non-empty string with at least 4 characters/
    );
  });
});

