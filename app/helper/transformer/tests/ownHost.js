describe("helper/transformer/ownHost", function () {
  var ownHost = require("../ownHost");
  var config = require("config");

  describe("hostnames", function () {
    it("includes the custom domain, stripped of a leading www.", function () {
      expect(ownHost.hostnames({ domain: "www.example.com" })).toEqual([
        "example.com"
      ]);
    });

    it("includes the handle's blot.im subdomain", function () {
      expect(ownHost.hostnames({ handle: "foo" })).toEqual([
        "foo." + config.host
      ]);
    });

    it("includes both the domain and the handle when both are given", function () {
      expect(
        ownHost.hostnames({ domain: "example.com", handle: "foo" })
      ).toEqual(["example.com", "foo." + config.host]);
    });

    it("returns an empty list when given nothing", function () {
      expect(ownHost.hostnames({})).toEqual([]);
      expect(ownHost.hostnames()).toEqual([]);
    });
  });

  describe("resolve", function () {
    var ownHostnames = ownHost.hostnames({
      domain: "example.com",
      handle: "foo"
    });

    it("resolves a URL on the custom domain to a local path", function () {
      expect(
        ownHost.resolve("https://example.com/images/cat.jpg", ownHostnames)
      ).toEqual("/images/cat.jpg");
    });

    it("resolves a URL on the handle's blot.im subdomain to a local path", function () {
      expect(
        ownHost.resolve(
          "https://foo." + config.host + "/images/cat.jpg",
          ownHostnames
        )
      ).toEqual("/images/cat.jpg");
    });

    it("treats the www and bare forms of a domain as equivalent", function () {
      expect(
        ownHost.resolve("https://www.example.com/cat.jpg", ownHostnames)
      ).toEqual("/cat.jpg");
    });

    it("strips the query string and hash", function () {
      expect(
        ownHost.resolve(
          "https://example.com/cat.jpg?static=1#top",
          ownHostnames
        )
      ).toEqual("/cat.jpg");
    });

    it("returns null for a URL on a different domain", function () {
      expect(
        ownHost.resolve("https://not-this-blog.com/cat.jpg", ownHostnames)
      ).toBe(null);
    });

    it("returns null for a relative path", function () {
      expect(ownHost.resolve("/cat.jpg", ownHostnames)).toBe(null);
    });

    it("returns null when there are no own hostnames configured", function () {
      expect(ownHost.resolve("https://example.com/cat.jpg", [])).toBe(null);
    });
  });
});
