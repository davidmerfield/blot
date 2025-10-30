const dns = require("dns").promises;
const nock = require("nock");
const verify = require("../verify");
const config = require("config");

describe("domain verifier", function () {
  const ourIP = config.ip;
  const ourHost = config.host;
  const ourIPv6 = config.ipv6 || "2001:db8::1";

  if (!config.ipv6) {
    config.ipv6 = ourIPv6;
  }
  let resolver;

  beforeEach(() => {
    resolver = {
      resolveCname: jasmine.createSpy("resolveCname"),
      resolve4: jasmine.createSpy("resolve4"),
      resolve6: jasmine.createSpy("resolve6"),
      setServers: jasmine.createSpy("setServers"),
    };
    spyOn(dns, "Resolver").and.returnValue(resolver);
    spyOn(dns, "resolveNs").and.returnValue(Promise.resolve([]));
    spyOn(dns, "lookup").and.returnValue(
      Promise.resolve([{ address: "203.0.113.1", family: 4 }])
    );

    resolver.resolve6.and.returnValue(Promise.resolve([]));
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should throw an error for hostnames without nameservers", async () => {
    const hostname = "fhdjkhfkdjhfkjdhjfkhdjkfdjk.com";
    const handle = "example";

    dns.resolveNs.and.returnValue(Promise.resolve([]));

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("NO_NAMESERVERS");
      expect(e.nameservers).toEqual([]);
    }
  });

  it("should return true for hostnames with correct A record", async () => {
    const hostname = "correct-a-record.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve([ourIP]));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.correct.com", "ns2.correct.com"])
    );

    const result = await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
    expect(result).toBe(true);
  });

  it("should throw an error for hostnames with multiple A records, one correct", async () => {
    const hostname = "multiple-a-records.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve([ourIP, "1.2.3.4"]));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.multiple.com", "ns2.multiple.com"])
    );

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("MULTIPLE_ADDRESS_BUT_ONE_IS_CORRECT");
      expect(e.recordToRemove).toEqual(["1.2.3.4"]);
      expect(e.nameservers).toEqual(["ns1.multiple.com", "ns2.multiple.com"]);
    }
  });

  it("should throw an error for hostnames with stray AAAA records", async () => {
    const hostname = "stray-aaaa-records.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve([ourIP]));
    resolver.resolve6.and.returnValue(
      Promise.resolve(["2001:db8::dead", "2001:db8::beef"])
    );
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.stray.com", "ns2.stray.com"])
    );

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("MULTIPLE_ADDRESS_BUT_ONE_IS_CORRECT");
      expect(e.recordToRemove).toEqual([
        "2001:db8::dead",
        "2001:db8::beef",
      ]);
      expect(e.nameservers).toEqual(["ns1.stray.com", "ns2.stray.com"]);
    }
  });

  it("should report stray IPv4 and IPv6 records when one address is correct", async () => {
    const hostname = "mixed-stray-records.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve([ourIP, "192.0.2.10"]));
    resolver.resolve6.and.returnValue(
      Promise.resolve([ourIPv6, "2001:db8::bad"])
    );
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.mixed.com", "ns2.mixed.com"])
    );

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("MULTIPLE_ADDRESS_BUT_ONE_IS_CORRECT");
      expect(e.recordToRemove).toEqual(["192.0.2.10", "2001:db8::bad"]);
      expect(e.nameservers).toEqual(["ns1.mixed.com", "ns2.mixed.com"]);
    }
  });

  it("should return true when AAAA record matches our IPv6", async () => {
    const hostname = "correct-aaaa-record.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve([]));
    resolver.resolve6.and.returnValue(Promise.resolve([ourIPv6]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.correctv6.com", "ns2.correctv6.com"])
    );

    const result = await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
    expect(result).toBe(true);
  });

  it("should throw an error for hostnames with incorrect CNAME record", async () => {
    const hostname = "incorrect-cname-record.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.resolve(["incorrect.host.com"])
    );
    resolver.resolve4.and.returnValue(Promise.reject(new Error("ENOTFOUND")));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.incorrect.com", "ns2.incorrect.com"])
    );

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("CNAME_RECORD_EXISTS_BUT_DOES_NOT_MATCH");
      expect(e.nameservers).toEqual(["ns1.incorrect.com", "ns2.incorrect.com"]);
    }
  });

  it("should return true for hostnames with correct handle verification", async () => {
    const hostname = "correct-handle.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve(["1.2.3.4"]));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.correct.com", "ns2.correct.com"])
    );

    nock(`http://1.2.3.4`)
      .get(`/verify/domain-setup`)
      .reply(200, handle, { "Content-Type": "text/plain" });

    const result = await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
    expect(result).toBe(true);
  });

  it("should throw an error for hostnames with incorrect handle verification", async () => {
    const hostname = "incorrect-handle.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve(["1.2.3.4"]));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.incorrect.com", "ns2.incorrect.com"])
    );

    nock(`http://1.2.3.4`)
      .get(`/verify/domain-setup`)
      .reply(200, "wrong-handle", { "Content-Type": "text/plain" });

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toBe("HANDLE_MISMATCH");
      expect(e.expected).toBe(handle);
      expect(e.received).toBe("wrong-handle");
      expect(e.nameservers).toEqual(["ns1.incorrect.com", "ns2.incorrect.com"]);
    }
  });

  it("should throw an error if HTTP request fails", async () => {
    const hostname = "request-fails.com";
    const handle = "example";

    resolver.resolveCname.and.returnValue(
      Promise.reject(new Error("ENOTFOUND"))
    );
    resolver.resolve4.and.returnValue(Promise.resolve(["1.2.3.4"]));
    resolver.resolve6.and.returnValue(Promise.resolve([]));
    dns.resolveNs.and.returnValue(
      Promise.resolve(["ns1.request-fails.com", "ns2.request-fails.com"])
    );

    nock(`http://1.2.3.4`)
      .get(`/verify/domain-setup`)
      .replyWithError("Network Error");

    try {
      await verify({ hostname, handle, ourIP, ourIPv6, ourHost });
      throw new Error("expected an error");
    } catch (e) {
      expect(e.message).toContain("Network Error");
      expect(e.nameservers).toEqual([
        "ns1.request-fails.com",
        "ns2.request-fails.com",
      ]);
    }
  });
});
