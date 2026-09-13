describe("getCachedEntryByUrl", function () {
  const Entry = require("models/entry");
  const cachePath = require.resolve("../load/getCachedEntryByUrl");

  function loadCache() {
    delete require.cache[cachePath];
    return require("../load/getCachedEntryByUrl");
  }

  afterEach(function () {
    delete require.cache[cachePath];
  });

  function stubGetByUrl(impl) {
    spyOn(Entry, "getByUrl").and.callFake(function (blogID, url, callback) {
      impl(blogID, url, callback);
    });
  }

  it("reuses the cached entry for identical cacheIDs", async function () {
    const getCachedEntryByUrl = loadCache();

    stubGetByUrl(function (blogID, url, callback) {
      callback({ path: "/linker.txt", title: "Linker", url: url });
    });

    const blog = { id: "blog-1", cacheID: 100 };
    const first = await getCachedEntryByUrl(blog, "/linker");
    const second = await getCachedEntryByUrl(blog, "/linker");

    expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
    expect(first.title).toBe("Linker");
    expect(second.title).toBe("Linker");
  });

  it("refetches when cacheID changes", async function () {
    const getCachedEntryByUrl = loadCache();

    stubGetByUrl(function (blogID, url, callback) {
      callback({ path: "/linker.txt", title: "Linker", url: url });
    });

    await getCachedEntryByUrl({ id: "blog-1", cacheID: 100 }, "/linker");
    await getCachedEntryByUrl({ id: "blog-1", cacheID: 101 }, "/linker");

    expect(Entry.getByUrl).toHaveBeenCalledTimes(2);
  });

  it("does not collide keys across blogs", async function () {
    const getCachedEntryByUrl = loadCache();

    stubGetByUrl(function (blogID, url, callback) {
      callback({ path: "/linker.txt", title: blogID, url: url });
    });

    const a = await getCachedEntryByUrl({ id: "blog-a", cacheID: 1 }, "/linker");
    const b = await getCachedEntryByUrl({ id: "blog-b", cacheID: 1 }, "/linker");

    expect(Entry.getByUrl).toHaveBeenCalledTimes(2);
    expect(a.title).toBe("blog-a");
    expect(b.title).toBe("blog-b");
  });

  it("does not cache a miss, so a transient Redis failure is not sticky", async function () {
    const getCachedEntryByUrl = loadCache();
    let calls = 0;

    stubGetByUrl(function (blogID, url, callback) {
      calls++;
      if (calls === 1) return callback();
      callback({ path: "/linker.txt", title: "Linker", url: url });
    });

    const blog = { id: "blog-1", cacheID: 100 };
    const first = await getCachedEntryByUrl(blog, "/linker");
    const second = await getCachedEntryByUrl(blog, "/linker");

    expect(Entry.getByUrl).toHaveBeenCalledTimes(2);
    expect(first).toBeNull();
    expect(second.title).toBe("Linker");
  });

  it("treats encoded and decoded URLs as the same cache key", async function () {
    const getCachedEntryByUrl = loadCache();

    stubGetByUrl(function (blogID, url, callback) {
      callback({ path: "/grüße.txt", title: "Greetings", url: url });
    });

    await getCachedEntryByUrl({ id: "blog-1", cacheID: 100 }, "/grüße");
    await getCachedEntryByUrl(
      { id: "blog-1", cacheID: 100 },
      "/gr%C3%BC%C3%9Fe"
    );

    expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight fetch across concurrent lookups", async function () {
    const getCachedEntryByUrl = loadCache();
    let resolveFetch;

    stubGetByUrl(function (blogID, url, callback) {
      resolveFetch = function () {
        callback({ path: "/linker.txt", title: "Linker", url: url });
      };
    });

    const first = getCachedEntryByUrl({ id: "blog-1", cacheID: 100 }, "/linker");
    const second = getCachedEntryByUrl({ id: "blog-1", cacheID: 100 }, "/linker");

    expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
    resolveFetch();

    const [a, b] = await Promise.all([first, second]);
    expect(a.title).toBe("Linker");
    expect(b.title).toBe("Linker");
  });

  it("returns isolated copies so caller mutations do not taint the cache", async function () {
    const getCachedEntryByUrl = loadCache();

    stubGetByUrl(function (blogID, url, callback) {
      callback({ path: "/linker.txt", title: "Original", url: url });
    });

    const blog = { id: "blog-1", cacheID: 100 };
    const first = await getCachedEntryByUrl(blog, "/linker");
    first.title = "Mutated";

    const second = await getCachedEntryByUrl(blog, "/linker");
    expect(second.title).toBe("Original");
  });
});
