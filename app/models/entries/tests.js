const redis = require("models/client");
const Entries = require("./index"); // Replace with the correct path to the Entries module
const Entry = require("../entry");
const Blog = require("../blog");
const entryKey = require("../entry/key").entry;

function buildEntry(path, overrides) {
  const now = Date.now();
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  const id = overrides && overrides.id ? overrides.id : normalizedPath;

  const base = {
    id,
    guid: id + ":guid",
    url: "",
    permalink: "",
    title: "Test entry",
    titleTag: "<h1>Test entry</h1>",
    body: "<p>Body</p>",
    summary: "Body",
    teaser: "Body",
    teaserBody: "<p>Body</p>",
    more: false,
    html: "<h1>Test entry</h1><p>Body</p>",
    slug: id.replace(/\//g, "-").replace(/\./g, "-"),
    name: normalizedPath.replace(/^\//, ""),
    path: normalizedPath,
    size: 0,
    tags: [],
    dependencies: [],
    backlinks: [],
    internalLinks: [],
    menu: false,
    page: false,
    deleted: false,
    draft: false,
    scheduled: false,
    thumbnail: {},
    dateStamp: now,
    created: now,
    updated: now,
    metadata: {},
    exif: {},
  };

  return Object.assign(base, overrides || {});
}

describe("entries", function () {
  // Cleans up the Redis database after each test
  // and exposes a test blog to each test
  global.test.blog();

  describe("entry TTL management", function () {
    it("sets a TTL when deleted and clears it when restored", function (done) {
      const blogID = this.blog.id;
      const path = "/ttl-entry.txt";
      const key = entryKey(blogID, path);

      Entry.set(blogID, path, buildEntry(path), function (err) {
        if (err) return done.fail(err);

        redis.ttl(key, function (err, ttl) {
          if (err) return done.fail(err);
          expect(ttl).toBe(-1);

          Entry.set(blogID, path, { deleted: true }, function (err) {
            if (err) return done.fail(err);

            redis.ttl(key, function (err, ttlAfterDelete) {
              if (err) return done.fail(err);
              expect(ttlAfterDelete).toBeGreaterThan(0);
              expect(ttlAfterDelete).toBeLessThanOrEqual(24 * 60 * 60);

              Entry.set(blogID, path, { deleted: false }, function (err) {
                if (err) return done.fail(err);

                redis.ttl(key, function (err, ttlAfterRestore) {
                  if (err) return done.fail(err);
                  expect(ttlAfterRestore).toBe(-1);
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  describe("pruneMissing", function () {
    it("removes orphaned IDs from entry lists", function (done) {
      const blogID = this.blog.id;
      const path = "/prune-entry.txt";
      const ghostID = "/ghost-entry";
      const listKey = `blog:${blogID}:entries`;

      Entry.set(blogID, path, buildEntry(path), function (err) {
        if (err) return done.fail(err);

        redis.zadd(listKey, Date.now(), ghostID, function (err) {
          if (err) return done.fail(err);

          Entries.pruneMissing(blogID, function (err) {
            if (err) return done.fail(err);

            redis.zrange(listKey, 0, -1, function (err, members) {
              if (err) return done.fail(err);
              expect(members).toContain(path);
              expect(members).not.toContain(ghostID);
              done();
            });
          });
        });
      });
    });
  });

  it("getTotal should return the total number of entries for a blog", async function (done) {
    const key = `blog:${this.blog.id}:entries`;

    // Add mock entries in Redis
    await redis.zadd(key, 1, "entry1", 2, "entry2", 3, "entry3");

    Entries.getTotal(this.blog.id, function (err, total) {
      expect(err).toBeNull();
      expect(total).toBe(3);
      done();
    });
  });

  it("getTotal should return 0 if no entries exist for a blog", function (done) {
    Entries.getTotal(this.blog.id, function (err, total) {
      expect(err).toBeNull();
      expect(total).toBe(0);
      done();
    });
  });

  it("getAllIDs should return all entry IDs for a blog", async function (done) {
    const key = `blog:${this.blog.id}:all`;

    // Add mock entries in Redis
    await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

    Entries.getAllIDs(this.blog.id, function (err, ids) {
      expect(err).toBeNull();
      expect(ids).toEqual(["id3", "id2", "id1"]); // Returned in descending order
      done();
    });
  });

  it("getAllIDs should return an empty array if no entries exist", function (done) {
    Entries.getAllIDs(this.blog.id, function (err, ids) {
      expect(err).toBeNull();
      expect(ids).toEqual([]);
      done();
    });
  });

  it("getPage should return a page of entries sorted by date", async function (done) {
    const key = `blog:${this.blog.id}:entries`;
    const now = Date.now();
    // Add 6 mock entries in Redis
    await redis.zadd(
        key,
        now,
        "/a.txt",
        now + 1000,
        "/b.txt",
        now + 2000,
        "/c.txt",
        now + 3000,
        "/d.txt",
        now + 4000,
        "/e.txt",
        now + 5000,
        "/f.txt"
    );  

    // spy on the Entry.get function
    // to return the full fake entry
    spyOn(Entry, "get").and.callFake((blogID, ids, callback) => {
        // if array, return an array of fake entries
        if (Array.isArray(ids)) {
            const entries = ids.map((id) => ({ id }));
            return callback(entries);
            // return a single fake entry
        } else {
            return callback({ id: ids });
        }
    });

    const pageNo = 2;
    const pageSize = 2;
    const blogID = this.blog.id;

    // get the second page of entries, 2 per page, sorted by date with newest first
    Entries.getPage(blogID, pageNo, pageSize, function (entries, pagination) {
        expect(entries.map((entry) => entry.id)).toEqual(["/d.txt", "/c.txt"]);
        expect(pagination).toEqual({
            current: 2,
            next: 3,
            previous: 1,
            total: 3, // 6 entries / 2 per page
            pageSize: 2,
        });

        // get the first page of entries, 2 per page, sorted reverse alphabetically
        Entries.getPage(blogID, 1, pageSize, function (entries, pagination) {
            expect(entries.map((entry) => entry.id)).toEqual(["/f.txt", "/e.txt"]);
            // get the first page of entries, 2 per page, sorted alphabetically
            Entries.getPage(blogID, 1, pageSize, function (entries, pagination) {
                expect(entries.map((entry) => entry.id)).toEqual(["/a.txt", "/b.txt"]);
                done();
            }, { sortBy: "id", order: "asc" });
        }, { sortBy: "id", order: "desc" });
    });
});

  it("getRecent should return the most recent entries with their indices", async function (done) {
    const key = `blog:${this.blog.id}:entries`;

    // Add mock entries in Redis
    await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

    // Mock entries returned by Entry.get
    spyOn(Entry, "get").and.callFake((blogID, ids, callback) => {
      const entries = ids.map((id, index) => ({
        id,
        dateStamp: Date.now() - index * 1000,
      }));
      callback(entries);
    });

    Entries.getRecent(this.blog.id, function (entries) {
      expect(entries.map((entry) => entry.id)).toEqual(["id3", "id2", "id1"]);
      expect(entries[0].index).toBe(3);
      expect(entries[1].index).toBe(2);
      expect(entries[2].index).toBe(1);
      done();
    });
  });

  it("getRecent should return an empty array if there are no entries", function (done) {
    Entries.getRecent(this.blog.id, function (entries) {
      expect(entries).toEqual([]);
      done();
    });
  });

  describe("adjacentTo", function () {
    beforeEach(function () {
      spyOn(Entry, "get").and.callFake((blogID, ids, callback) => {
        const entries = ids.map((id) => ({ id }));
        callback(entries);
      });
    });

    it("should return adjacent entries correctly", async function (done) {
      const key = `blog:${this.blog.id}:entries`;

      // Add mock entries in Redis
      await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

      Entries.adjacentTo(this.blog.id, "id2", function (next, previous, rank) {
        expect(previous).toEqual({ id: "id1" });
        expect(next).toEqual({ id: "id3" });
        expect(rank).toBe(2);
        done();
      });
    });

    it("should return undefined if the entry is at the start of the list", async function (done) {
      const key = `blog:${this.blog.id}:entries`;

      // Add mock entries in Redis
      await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

      Entries.adjacentTo(this.blog.id, "id1", function (next, previous, rank) {
        expect(previous).toBeUndefined();
        expect(next).toEqual({ id: "id2" });
        expect(rank).toBe(1);
        done();
      });
    });

    it("should return undefined if the entry is at the end of the list", async function (done) {
      const key = `blog:${this.blog.id}:entries`;

      // Add mock entries in Redis
      await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

      Entries.adjacentTo(this.blog.id, "id3", function (next, previous, rank) {
        expect(previous).toEqual({ id: "id2" });
        expect(next).toBeUndefined();
        expect(rank).toBe(3);
        done();
      });
    });
  });

  describe("random", function () {
    it("returns undefined when there are no published entries", function (done) {
      const originalZrandmember = redis.zrandmember;

      spyOn(redis, "zrandmember").and.callFake(function (key, callback) {
        callback(null, null);
      });

      Entries.random(this.blog.id, (entry) => {
        try {
          expect(entry).toBeUndefined();
          done();
        } catch (err) {
          done.fail(err);
        } finally {
          redis.zrandmember = originalZrandmember;
        }
      });
    });

    it("retries until an entry with a public URL is found", function (done) {
      const originalZrandmember = redis.zrandmember;
      const originalEntryGet = Entry.get;
      const candidates = ["missing", "valid"];

      spyOn(redis, "zrandmember").and.callFake(function (key, callback) {
        callback(null, candidates.shift());
      });

      spyOn(Entry, "get").and.callFake(function (blogID, entryID, callback) {
        if (entryID === "missing") return callback({ id: entryID });

        callback({ id: entryID, url: "/valid" });
      });

      Entries.random(this.blog.id, function (entry) {
        try {
          expect(entry).toEqual(jasmine.objectContaining({ id: "valid", url: "/valid" }));
          expect(redis.zrandmember.calls.count()).toBe(2);
          expect(Entry.get.calls.count()).toBe(2);
          done();
        } catch (err) {
          done.fail(err);
        } finally {
          redis.zrandmember = originalZrandmember;
          Entry.get = originalEntryGet;
        }
      });
    });

    it("stops after the maximum attempts when entries have no public URL", function (done) {
      const originalZrandmember = redis.zrandmember;
      const originalEntryGet = Entry.get;
      let calls = 0;

      spyOn(redis, "zrandmember").and.callFake(function (key, callback) {
        callback(null, "missing");
      });

      spyOn(Entry, "get").and.callFake(function (blogID, entryID, callback) {
        calls++;
        callback({ id: entryID });
      });

      Entries.random(this.blog.id, function (entry) {
        try {
          expect(entry).toBeUndefined();
          expect(calls).toBe(Entries.random.MAX_ATTEMPTS);
          done();
        } catch (err) {
          done.fail(err);
        } finally {
          redis.zrandmember = originalZrandmember;
          Entry.get = originalEntryGet;
        }
      });
    });

  });

  describe("resave", function () {
    it("should update entries with new dateStamps", async function (done) {
      const blog = { id: this.blog.id, permalink: true };
      const entries = [
        { path: "entry1", metadata: {}, id: "id1", metadata: {} },
        { path: "entry2", metadata: {}, id: "id2", metadata: {} },
      ];

      // Mock Blog.get
      spyOn(Blog, "get").and.callFake((query, callback) => {
        callback(null, blog);
      });

      // Add mock entries in Redis
      const key = `blog:${this.blog.id}:all`;
      await redis.zadd(key, 1, "id1", 2, "id2");

      // Mock Entry.get to return the entries
      spyOn(Entry, "get").and.callFake((blogID, id, callback) => {
        const result = entries.find((entry) => entry.id === id);
        callback(result);
      });

      // Mock Entry.set
      spyOn(Entry, "set").and.callFake((blogID, path, changes, callback) => {
        expect(changes).toEqual(jasmine.any(Object));
        callback();
      });

      Entries.resave(this.blog.id, function (err) {
        expect(err).toBeNull();
        expect(Entry.set).toHaveBeenCalledTimes(2); // Once per entry
        done();
      });
    });

    it("should handle errors when fetching the blog", function (done) {
      // Mock Blog.get
      spyOn(Blog, "get").and.callFake((query, callback) => {
        callback(new Error("Blog not found"));
      });

      Entries.resave(this.blog.id, function (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.message).toBe("Blog not found");
        done();
      });
    });
  });
});
