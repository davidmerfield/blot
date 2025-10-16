describe("entry.get", function () {
  require("./setup")();

  const redis = require("models/client");
  const get = require("../get");
  const key = require("../key");
  const format = require("../format");

  const del = (...keys) => {
    const filtered = keys.filter(Boolean);

    if (!filtered.length) return Promise.resolve();

    return new Promise((resolve, reject) => {
      redis.del(filtered, err => {
        if (err) return reject(err);
        resolve();
      });
    });
  };

  const hmset = (hashKey, values) =>
    new Promise((resolve, reject) => {
      redis.hmset(hashKey, values, err => {
        if (err) return reject(err);
        resolve();
      });
    });

  const fetch = (blogID, path, fields) =>
    new Promise(resolve => {
      if (fields === undefined) {
        get(blogID, path, entry => resolve(entry));
      } else {
        get(blogID, path, fields, value => resolve(value));
      }
    });

  it("returns the full entry from the hash store", async function (done) {
    const path = "/hash-entry.txt";
    const hashKey = key.entryHash(this.blog.id, path);
    const legacyKey = key.entry(this.blog.id, path);
    const stored = {
      id: path,
      title: "Hash entry",
      tags: ["hash", "entry"],
      size: 321,
      menu: true,
    };

    await del(hashKey, legacyKey);
    await hmset(hashKey, format.serialize(stored));

    const entry = await fetch(this.blog.id, path);

    expect(entry).toEqual(jasmine.objectContaining(stored));

    await del(hashKey, legacyKey);

    done();
  });

  it("falls back to the legacy JSON key when the hash is missing", async function (done) {
    const path = "/legacy-entry.txt";
    const hashKey = key.entryHash(this.blog.id, path);

    const entry = await this.set(path, "Title: Legacy entry\n\nHello");

    await del(hashKey);

    const fetched = await fetch(this.blog.id, path);

    expect(fetched).toEqual(jasmine.objectContaining({ title: entry.title }));

    done();
  });

  it("returns a scalar when requesting a single field", async function (done) {
    const path = "/hash-title.txt";
    const hashKey = key.entryHash(this.blog.id, path);
    const legacyKey = key.entry(this.blog.id, path);
    const stored = {
      id: path,
      title: "Hash title",
      size: 10,
    };

    await del(hashKey, legacyKey);
    await hmset(hashKey, format.serialize(stored));

    const title = await fetch(this.blog.id, path, "title");

    expect(title).toEqual(stored.title);

    await del(hashKey, legacyKey);

    done();
  });

  it("returns a field value when falling back to the JSON entry", async function (done) {
    const path = "/legacy-title.txt";
    const hashKey = key.entryHash(this.blog.id, path);

    const entry = await this.set(path, "Title: Legacy title\n\nHello");

    await del(hashKey);

    const title = await fetch(this.blog.id, path, "title");

    expect(title).toEqual(entry.title);

    done();
  });
});
