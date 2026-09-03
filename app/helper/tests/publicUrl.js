describe("publicUrl", function () {
  const publicUrl = require("helper/publicUrl");
  const { assertPublicUrl, isBlockedAddress } = publicUrl;

  const BLOCKED = [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.5.5",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata endpoint
    "100.64.0.1", // CGNAT
    "::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "fe80::1", // link-local
    "fd00::1" // unique-local
  ];

  const PUBLIC = ["8.8.8.8", "1.1.1.1", "2606:2800:220:1:248:1893:25c8:1946"];

  it("flags private, loopback and link-local addresses", function () {
    BLOCKED.forEach((ip) => expect(isBlockedAddress(ip)).toBe(true));
  });

  it("allows routable public addresses", function () {
    PUBLIC.forEach((ip) => expect(isBlockedAddress(ip)).toBe(false));
  });

  it("fails closed on anything that is not an IP literal", function () {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });

  it("rejects non-http(s) protocols regardless of environment", async function () {
    await expectAsync(assertPublicUrl("file:///etc/passwd")).toBeRejected();
    await expectAsync(assertPublicUrl("ftp://example.com/x")).toBeRejected();
    await expectAsync(assertPublicUrl("data:text/plain,hi")).toBeRejected();
  });

  describe("when enforcement is enabled", function () {
    beforeAll(() => publicUrl.setEnabled(true));
    afterAll(() => publicUrl.setEnabled(false));

    it("rejects http(s) URLs whose host is a blocked IP literal", async function () {
      await expectAsync(assertPublicUrl("http://127.0.0.1:6379/")).toBeRejected();
      await expectAsync(
        assertPublicUrl("http://169.254.169.254/latest/meta-data/")
      ).toBeRejected();
      await expectAsync(assertPublicUrl("http://[::1]/")).toBeRejected();
    });

    it("rejects hostnames that resolve to a blocked address", async function () {
      // localhost resolves to 127.0.0.1 / ::1 via the hosts file
      await expectAsync(assertPublicUrl("http://localhost/")).toBeRejected();
    });

    it("resolves for an http(s) URL with a public host", async function () {
      await expectAsync(assertPublicUrl("http://8.8.8.8/")).toBeResolved();
    });
  });
});
