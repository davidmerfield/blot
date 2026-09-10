var rawGet = require("../get");

describe("entry.get", function () {
  require("./setup")();

  var get = function (blogID, ids, fields) {
    return new Promise(function (resolve) {
      if (fields === undefined) {
        rawGet(blogID, ids, resolve);
      } else {
        rawGet(blogID, ids, fields, resolve);
      }
    });
  };

  it("returns a whole entry from the hash", async function () {
    await this.set("/post.txt", "# Hello\n\nthe body");

    var entry = await get(this.blog.id, "/post.txt");

    expect(entry.path).toEqual("/post.txt");
    expect(entry.title).toEqual("Hello");
    expect(typeof entry.html).toEqual("string");
    expect(entry.html.length).toBeGreaterThan(0);
    expect(Array.isArray(entry.tags)).toBe(true);
  });

  it("returns a single field as a scalar for a single entry", async function () {
    await this.set("/post.txt", "# Scalar title\n\nbody");

    var title = await get(this.blog.id, "/post.txt", "title");

    expect(title).toEqual("Scalar title");
  });

  it("returns only the requested fields (plus id) for an array of fields", async function () {
    await this.set("/post.txt", "# Narrow\n\nbody text");

    var entry = await get(this.blog.id, "/post.txt", ["title", "url"]);

    expect(entry.title).toEqual("Narrow");
    expect(entry.id).toEqual("/post.txt");
    expect("html" in entry).toBe(false);
    expect("body" in entry).toBe(false);
  });

  it("narrows a list of entries", async function () {
    await this.set("/a.txt", "# Alpha\n\naaa");
    await this.set("/b.txt", "# Beta\n\nbbb");

    var entries = await get(this.blog.id, ["/a.txt", "/b.txt"], ["title"]);

    expect(entries.length).toEqual(2);
    entries.forEach(function (entry) {
      expect(typeof entry.title).toEqual("string");
      expect("html" in entry).toBe(false);
    });
  });

  it("keeps id on a multi-entry single-field read so results stay correlatable", async function () {
    await this.set("/a.txt", "# Alpha\n\naaa");
    await this.set("/b.txt", "# Beta\n\nbbb");

    var entries = await get(this.blog.id, ["/a.txt", "/b.txt"], "title");

    expect(entries.length).toEqual(2);
    entries.forEach(function (entry) {
      expect(typeof entry.title).toEqual("string");
      expect(typeof entry.id).toEqual("string");
    });
  });

  it("returns undefined for a missing single entry", async function () {
    var entry = await get(this.blog.id, "/does-not-exist.txt");

    expect(entry).toBeUndefined();
  });

  it("returns an empty array for an empty list", async function () {
    var entries = await get(this.blog.id, []);

    expect(entries).toEqual([]);
  });
});
