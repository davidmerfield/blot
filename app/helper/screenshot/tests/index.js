const fs = require("fs-extra");
const screenshot = require("../index.js");

const { isPublicAddress, parseWebUrl, validateDestination, protectRequests } = screenshot._security;

describe("screenshot destination protection", function () {
  const output = __dirname + "/data/rejected.png";
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const privateLookup = async () => [{ address: "10.0.0.4", family: 4 }];

  async function expectRejection(promise, pattern) {
    let error;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }
    expect(error).toEqual(jasmine.any(Error));
    expect(error.message).toMatch(pattern);
  }

  beforeEach(async () => fs.remove(output));

  for (const protocol of ["file:///etc/passwd", "data:text/plain,hello", "chrome://settings"]) {
    it(`rejects ${protocol.split(":")[0]} URLs`, () => {
      expect(() => parseWebUrl(protocol)).toThrowError(/protocol is not allowed/);
    });
  }

  it("rejects localhost names", async () => {
    await expectRejection(validateDestination("http://localhost", new Map(), privateLookup), /not public/);
  });

  it("rejects private IPv4 and IPv6 literals, including mapped addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "169.254.1.1", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(address)).withContext(address).toBe(false);
    }
  });

  it("rejects DNS names when any answer is private", async () => {
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "fd00::1", family: 6 },
    ];
    await expectRejection(validateDestination("https://example.com", new Map(), lookup), /not public/);
  });

  it("permits a public HTTPS destination", async () => {
    const url = await validateDestination("https://example.com/page", new Map(), publicLookup);
    expect(url.href).toBe("https://example.com/page");
  });

  it("aborts redirects and subresources that target private addresses", async () => {
    const handlers = {};
    const page = {
      setRequestInterception: jasmine.createSpy().and.returnValue(Promise.resolve()),
      on: (event, handler) => { handlers[event] = handler; },
    };
    const protection = await protectRequests(page, publicLookup);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);

    for (const target of ["http://127.0.0.1/redirect", "http://[::1]/asset.png"]) {
      const request = {
        url: () => target,
        continue: jasmine.createSpy(),
        abort: jasmine.createSpy().and.returnValue(Promise.resolve()),
      };
      await handlers.request(request);
      expect(request.abort).toHaveBeenCalledWith("blockedbyclient");
    }
    expect(protection.blockedError().message).toMatch(/not public/);
  });

  it("rejects DNS rebinding between requests", async () => {
    let calls = 0;
    const lookup = async () => [{ address: calls++ ? "93.184.216.35" : "93.184.216.34", family: 4 }];
    const cache = new Map();
    await validateDestination("https://example.com", cache, lookup);
    await expectRejection(validateDestination("https://example.com/image", cache, lookup), /changed address/);
  });

  it("does not leave a screenshot file after validation failure", async () => {
    await fs.outputFile(output, "stale partial output");
    await expectAsync(screenshot("file:///etc/passwd", output)).toBeRejected();
    expect(await fs.pathExists(output)).toBe(false);
  });
});
