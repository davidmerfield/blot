describe("transformer/download invalid()", function () {
  const publicUrl = require("helper/publicUrl");
  const invalid = require("./invalid");

  it("rejects non-http(s) URLs", function () {
    ["file:///etc/passwd", "ftp://example.com/x", "data:text/plain,hi"].forEach(
      (url) => expect(invalid(url) instanceof Error).toBe(true)
    );
  });

  it("allows ordinary http(s) URLs", function () {
    [
      "https://example.com/image.png",
      "https://8.8.8.8/image.png",
      "http://localhost:8919/foo.html"
    ].forEach((url) => expect(invalid(url)).toBe(false));
  });

  describe("with SSRF enforcement enabled", function () {
    beforeAll(() => publicUrl.setEnabled(true));
    afterAll(() => publicUrl.setEnabled(false));

    it("rejects private/loopback/link-local IP literals", function () {
      [
        "http://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
        "http://127.0.0.1:6379/", // loopback (e.g. redis)
        "http://[::1]/",
        "http://10.0.0.5:8080/x",
        "http://192.168.1.1/x"
      ].forEach((url) => expect(invalid(url) instanceof Error).toBe(true));
    });

    it("still allows public IP literals and hostnames", function () {
      ["https://8.8.8.8/image.png", "https://example.com/image.png"].forEach(
        (url) => expect(invalid(url)).toBe(false)
      );
    });
  });
});
