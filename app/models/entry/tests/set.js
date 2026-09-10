var config = require("config");
var redis = require("models/client");
var key = require("../key");

describe("entry.set string-key dual-write", function () {
  require("./setup")();

  var previousFlag;

  beforeEach(function () {
    previousFlag = config.redis.readEntriesFromHash;
  });

  afterEach(function () {
    config.redis.readEntriesFromHash = previousFlag;
  });

  var exists = function (k) {
    return redis.exists(k).then(function (n) {
      return Number(n) >= 1;
    });
  };

  it("writes both the JSON string and the hash when hash reads are off", async function () {
    config.redis.readEntriesFromHash = false;

    await this.set("/post.txt", "# Hi\n\nbody");

    expect(await exists(key.entry(this.blog.id, "/post.txt"))).toBe(true);
    expect(await exists(key.entryHash(this.blog.id, "/post.txt"))).toBe(true);
  });

  it("writes only the hash for a new entry when hash reads are on", async function () {
    config.redis.readEntriesFromHash = true;

    await this.set("/hashonly.txt", "# Hash only\n\nbody");

    expect(await exists(key.entryHash(this.blog.id, "/hashonly.txt"))).toBe(true);
    expect(await exists(key.entry(this.blog.id, "/hashonly.txt"))).toBe(false);
  });

  it("leaves an existing string key untouched when hash reads are on", async function () {
    // Create it with the flag off so the string key exists...
    config.redis.readEntriesFromHash = false;
    await this.set("/existing.txt", "# One\n\nbody");
    expect(await exists(key.entry(this.blog.id, "/existing.txt"))).toBe(true);

    // ...then edit it with the flag on.
    config.redis.readEntriesFromHash = true;
    await this.set("/existing.txt", "# Two\n\nbody");

    // The hash reflects the edit; the stale string is left for the purge.
    var entry = await this.get("/existing.txt");
    expect(entry.title).toEqual("Two");
    expect(await exists(key.entry(this.blog.id, "/existing.txt"))).toBe(true);
  });

  it("expires a stale string key when a pre-migration entry is deleted in hash-only mode", async function () {
    config.redis.readEntriesFromHash = false;
    await this.set("/del.txt", "# Del\n\nbody");
    expect(await redis.ttl(key.entry(this.blog.id, "/del.txt"))).toBe(-1);

    // Delete it with hash reads on: set.js doesn't rewrite the string, but it
    // must still bound it so it can't outlive the 24h hash tombstone.
    config.redis.readEntriesFromHash = true;
    await this.drop("/del.txt");

    var ttl = await redis.ttl(key.entry(this.blog.id, "/del.txt"));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
