const redis = require("models/client");
const Entries = require("./index"); // Replace with the correct path to the Entries module
const Entry = require("../entry");
const Blog = require("../blog");

describe("entries", function () {
  // Cleans up the Redis database after each test
  // and exposes a test blog to each test
  global.test.blog();

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
            return callback(null, entries);
            // return a single fake entry
        } else {
            return callback(null, { id: ids });
        }
    });

    const pageNo = 2;
    const pageSize = 2;
    const blogID = this.blog.id;

    // get the second page of entries, 2 per page, sorted by date with newest first
    Entries.getPage(blogID, pageNo, pageSize, function (err, entries, pagination) {
        expect(err).toBeNull();
        expect(entries.map((entry) => entry.id)).toEqual(["/d.txt", "/c.txt"]);
        expect(pagination).toEqual({
            current: 2,
            next: 3,
            previous: 1,
            total: 3, // 6 entries / 2 per page
            pageSize: 2,
        });

        // get the first page of entries, 2 per page, sorted reverse alphabetically
        Entries.getPage(blogID, 1, pageSize, function (err2, entries, pagination) {
            expect(err2).toBeNull();
            expect(entries.map((entry) => entry.id)).toEqual(["/f.txt", "/e.txt"]);
            // get the first page of entries, 2 per page, sorted alphabetically
            Entries.getPage(blogID, 1, pageSize, function (err3, entries, pagination) {
                expect(err3).toBeNull();
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
      callback(null, entries);
    });

    Entries.getRecent(this.blog.id, function (err, entries) {
      expect(err).toBeNull();
      expect(entries.map((entry) => entry.id)).toEqual(["id3", "id2", "id1"]);
      expect(entries[0].index).toBe(3);
      expect(entries[1].index).toBe(2);
      expect(entries[2].index).toBe(1);
      done();
    });
  });

  it("getRecent should return an empty array if there are no entries", function (done) {
    Entries.getRecent(this.blog.id, function (err, entries) {
      expect(err).toBeNull();
      expect(entries).toEqual([]);
      done();
    });
  });

  describe("adjacentTo", function () {
    beforeEach(function () {
      spyOn(Entry, "get").and.callFake((blogID, ids, callback) => {
        const entries = ids.map((id) => ({ id }));
        callback(null, entries);
      });
    });

    it("should return adjacent entries correctly", async function (done) {
      const key = `blog:${this.blog.id}:entries`;

      // Add mock entries in Redis
      await redis.zadd(key, 1, "id1", 2, "id2", 3, "id3");

      Entries.adjacentTo(this.blog.id, "id2", function (err, next, previous, rank) {
        expect(err).toBeNull();
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

      Entries.adjacentTo(this.blog.id, "id1", function (err, next, previous, rank) {
        expect(err).toBeNull();
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

      Entries.adjacentTo(this.blog.id, "id3", function (err, next, previous, rank) {
        expect(err).toBeNull();
        expect(previous).toEqual({ id: "id2" });
        expect(next).toBeUndefined();
        expect(rank).toBe(3);
        done();
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
        callback(null, result);
      });

      // Mock Entry.set
      spyOn(Entry, "set").and.callFake((blogID, path, changes, callback) => {
        expect(changes).toEqual(jasmine.any(Object));
        callback(null);
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
