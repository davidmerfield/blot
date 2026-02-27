const redisSearchPath = require.resolve("helper/redisSearch");
const redisModelPath = require.resolve("models/client-new");

function loadWithClient(mockClient) {
  delete require.cache[redisSearchPath];

  require.cache[redisModelPath] = {
    id: redisModelPath,
    filename: redisModelPath,
    loaded: true,
    exports: mockClient,
  };

  return require(redisSearchPath);
}

function runSearch(main, term) {
  return new Promise((resolve, reject) => {
    main(term, function (err, result) {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function normalizeSearchResults(results) {
  return results
    .map((entry) => ({
      key: entry.key,
      type: entry.type,
      value: entry.value,
    }))
    .sort((a, b) => {
      const aComparable = `${a.key}\u0000${a.type}\u0000${a.value}`;
      const bComparable = `${b.key}\u0000${b.type}\u0000${b.value}`;
      return aComparable.localeCompare(bComparable);
    });
}

function uniqueNormalizedSearchResults(results) {
  const uniqueEntries = new Map();

  results.forEach((entry) => {
    const id = `${entry.key}|${entry.type}|${entry.value}`;
    uniqueEntries.set(id, entry);
  });

  return normalizeSearchResults(Array.from(uniqueEntries.values()));
}

describe("redisSearch helper", function () {
  afterEach(function () {
    delete require.cache[redisSearchPath];
    delete require.cache[redisModelPath];
  });

  it("searches string/hash/list/set/zset values and key names", async function () {
    const keyTypes = {
      "string:key": "string",
      "hash:key": "hash",
      "list:key": "list",
      "set:key": "set",
      "zset:key": "zset",
      "needle:key": "string",
    };

    const mockClient = {
      scan: jasmine
        .createSpy("scan")
        .and.returnValues(
          Promise.resolve({ cursor: "1", keys: ["string:key", "hash:key"] }),
          Promise.resolve({ cursor: 0, keys: ["list:key", "set:key", "zset:key", "needle:key"] })
        ),
      type: jasmine.createSpy("type").and.callFake((key) => Promise.resolve(keyTypes[key])),
      get: jasmine
        .createSpy("get")
        .and.callFake((key) => Promise.resolve(key === "string:key" ? "prefix-needle-suffix" : "other")),
      hGetAll: jasmine
        .createSpy("hGetAll")
        .and.returnValue(Promise.resolve({ field: "contains needle", needleField: "nope" })),
      lRange: jasmine
        .createSpy("lRange")
        .and.returnValue(Promise.resolve(["x", "list-needle"])),
      sMembers: jasmine
        .createSpy("sMembers")
        .and.returnValue(Promise.resolve(["set-needle", "y"])),
      zRange: jasmine
        .createSpy("zRange")
        .and.returnValue(Promise.resolve(["zset-needle", "z"])),
    };

    const main = loadWithClient(mockClient);
    const result = await runSearch(main, "needle");

    expect(mockClient.scan).toHaveBeenCalledWith("0", {
      MATCH: "*",
      COUNT: 1000,
    });
    expect(mockClient.hGetAll).toHaveBeenCalledWith("hash:key");
    expect(mockClient.lRange).toHaveBeenCalledWith("list:key", 0, -1);
    expect(mockClient.sMembers).toHaveBeenCalledWith("set:key");
    expect(mockClient.zRange).toHaveBeenCalledWith("zset:key", 0, -1);

    // Contract: redisSearch returns matching entries, and callers should treat ordering as unspecified.
    expect(uniqueNormalizedSearchResults(result)).toEqual(
      normalizeSearchResults([
        { key: "needle:key", value: "KEY ITSELF", type: "KEY" },
        { key: "string:key", type: "STRING", value: "prefix-needle-suffix" },
        { key: "hash:key", type: "HASH", value: "field contains needle" },
        { key: "hash:key", type: "HASH", value: "needleField nope" },
        { key: "list:key", type: "LIST", value: "list-needle" },
        { key: "set:key", type: "SET", value: "set-needle" },
        { key: "zset:key", type: "ZSET", value: "zset-needle" },
      ])
    );
  });

  it("handles RESP3 scan replies that return both keys and results arrays", async function () {
    const mockClient = {
      scan: jasmine
        .createSpy("scan")
        .and.returnValues(
          Promise.resolve({ cursor: "1", results: ["k1"] }),
          Promise.resolve({ cursor: "0", keys: ["k2"] })
        ),
      type: jasmine.createSpy("type").and.returnValue(Promise.resolve("string")),
      get: jasmine.createSpy("get").and.returnValue(Promise.resolve("no match")),
      hGetAll: jasmine.createSpy("hGetAll"),
      lRange: jasmine.createSpy("lRange"),
      sMembers: jasmine.createSpy("sMembers"),
      zRange: jasmine.createSpy("zRange"),
    };

    const main = loadWithClient(mockClient);
    const result = await runSearch(main, "needle");

    expect(mockClient.type.calls.count()).toBe(2);
    expect(mockClient.type.calls.argsFor(0)[0]).toBe("k1");
    expect(mockClient.type.calls.argsFor(1)[0]).toBe("k2");
    expect(result).toEqual([]);
  });
});
