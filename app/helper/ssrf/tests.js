const {
  isPrivateIP,
  isLoopback,
  parseHttpUrl,
  assertPublicHttpUrl,
} = require("../index");

function expectRejectedWith(promise, matcher) {
  return promise.then(
    function () {
      throw new Error("Expected promise to reject");
    },
    function (err) {
      if (typeof matcher === "function") matcher(err);
      else if (matcher) expect(err.code).toEqual(matcher);
    }
  );
}

describe("ssrf helper", function () {
  describe("isPrivateIP", function () {
    it("flags loopback, RFC1918, link-local, and CGNAT IPv4 ranges", function () {
      [
        "0.0.0.0",
        "10.0.0.5",
        "100.64.0.1",
        "100.100.100.200",
        "127.0.0.1",
        "127.0.0.2",
        "169.254.169.254",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
      ].forEach(function (ip) {
        expect(isPrivateIP(ip)).toBe(true);
      });
    });

    it("allows public IPv4 addresses", function () {
      ["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1"].forEach(
        function (ip) {
          expect(isPrivateIP(ip)).toBe(false);
        }
      );
    });

    it("flags IPv6 loopback, unique-local, and link-local", function () {
      ["::", "::1", "fc00::1", "fd12:3456:789a::1", "fe80::1"].forEach(function (
        ip
      ) {
        expect(isPrivateIP(ip)).toBe(true);
      });
    });

    it("unwraps IPv4-mapped and NAT64 encodings of private addresses", function () {
      expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIP("::ffff:169.254.169.254")).toBe(true);
      expect(isPrivateIP("::ffff:7f00:1")).toBe(true);
      expect(isPrivateIP("64:ff9b::169.254.169.254")).toBe(true);
      expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
    });
  });

  describe("isLoopback", function () {
    it("matches only loopback addresses", function () {
      expect(isLoopback("127.0.0.1")).toBe(true);
      expect(isLoopback("127.255.255.255")).toBe(true);
      expect(isLoopback("::1")).toBe(true);
      expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
      expect(isLoopback("10.0.0.1")).toBe(false);
      expect(isLoopback("169.254.169.254")).toBe(false);
      expect(isLoopback("8.8.8.8")).toBe(false);
    });
  });

  describe("parseHttpUrl", function () {
    it("accepts http and https URLs with a host", function () {
      expect(parseHttpUrl("https://example.com/x").hostname).toEqual("example.com");
      expect(parseHttpUrl("http://example.com:8080/x").port).toEqual("8080");
    });

    it("rejects missing hosts and non-http schemes", function () {
      expect(function () {
        parseHttpUrl("file:///etc/passwd");
      }).toThrow();
      expect(function () {
        parseHttpUrl("chrome://version");
      }).toThrow();
      expect(function () {
        parseHttpUrl("data:text/html,hello");
      }).toThrow();
      expect(function () {
        parseHttpUrl("javascript:alert(1)");
      }).toThrow();
      expect(function () {
        parseHttpUrl("ftp://example.com/file");
      }).toThrow();
      expect(function () {
        parseHttpUrl("http://");
      }).toThrow();
      expect(function () {
        parseHttpUrl("not a url");
      }).toThrow();
    });
  });

  describe("assertPublicHttpUrl", function () {
    it("rejects private and link-local IP literals even when loopback is allowed", async function () {
      await expectRejectedWith(
        assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/", {
          allowLoopback: true,
        }),
        "ERR_SSRF"
      );
      await expectRejectedWith(
        assertPublicHttpUrl("http://10.0.0.5:8080/x", { allowLoopback: true }),
        "ERR_SSRF"
      );
      await expectRejectedWith(
        assertPublicHttpUrl("http://192.168.1.1/", { allowLoopback: true }),
        "ERR_SSRF"
      );
    });

    it("rejects loopback IP literals when allowLoopback is false", async function () {
      await expectRejectedWith(
        assertPublicHttpUrl("http://127.0.0.1:6379/", { allowLoopback: false }),
        "ERR_SSRF"
      );
      await expectRejectedWith(
        assertPublicHttpUrl("http://[::1]/", { allowLoopback: false }),
        "ERR_SSRF"
      );
    });

    it("allows loopback IP literals when allowLoopback is true", async function () {
      await assertPublicHttpUrl("http://127.0.0.1:8919/foo", {
        allowLoopback: true,
      });
      await assertPublicHttpUrl("http://[::1]/", { allowLoopback: true });
    });

    it("allows public IP literals", async function () {
      await assertPublicHttpUrl("http://8.8.8.8/", { allowLoopback: false });
    });

    it("rejects hosts that resolve to a private address", async function () {
      await expectRejectedWith(
        assertPublicHttpUrl("http://metadata.internal/", {
          allowLoopback: false,
          lookup: async function () {
            return [{ address: "169.254.169.254", family: 4 }];
          },
        }),
        "ERR_SSRF"
      );
    });

    it("rejects dual-homed hosts that include a private address", async function () {
      await expectRejectedWith(
        assertPublicHttpUrl("http://mixed.example/", {
          allowLoopback: false,
          lookup: async function () {
            return [
              { address: "8.8.8.8", family: 4 },
              { address: "10.0.0.1", family: 4 },
            ];
          },
        }),
        "ERR_SSRF"
      );
    });

    it("allows hosts that resolve only to public addresses", async function () {
      await assertPublicHttpUrl("http://images.example/photo.jpg", {
        allowLoopback: false,
        lookup: async function () {
          return [{ address: "93.184.216.34", family: 4 }];
        },
      });
    });

    it("allows localhost in development via DNS when loopback is permitted", async function () {
      await assertPublicHttpUrl("http://localhost:8919/foo.html", {
        allowLoopback: true,
      });
    });
  });
});
