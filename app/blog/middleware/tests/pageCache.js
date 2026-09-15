const pageCache = require("../pageCache");
const fromCloudflare = require("../../lib/fromCloudflare");
const replaceFolderLinks = require("../../render/replaceFolderLinks/html");
const main = require("../../render/main");

describe("page cache helpers", function () {
  beforeEach(function () {
    pageCache._clear();
  });

  it("caches public GET HTML and skips preview, random, and debug", function () {
    const req = {
      method: "GET",
      preview: false,
      query: {},
      path: "/",
      url: "/",
      blog: { id: "blog-1", cacheID: 1 },
      template: { id: "SITE:diary" },
      protocol: "https",
      originalHost: "example.com",
      get: function () {
        return "example.com";
      },
      headers: {},
    };

    expect(pageCache._shouldCachePage(req)).toBe(true);
    expect(pageCache._shouldCachePage(Object.assign({}, req, { preview: true }))).toBe(false);
    expect(pageCache._shouldCachePage(Object.assign({}, req, { path: "/random" }))).toBe(false);
    expect(
      pageCache._shouldCachePage(Object.assign({}, req, { query: { json: "true" } }))
    ).toBe(false);
    expect(
      pageCache._shouldCachePage(
        Object.assign({}, req, { path: "/draft/view/Drafts/index.txt" })
      )
    ).toBe(false);
    expect(
      pageCache._shouldCachePage(
        Object.assign({}, req, { path: "/draft/stream/Drafts/index.txt" })
      )
    ).toBe(false);
    expect(
      pageCache._shouldCachePage(Object.assign({}, req, { path: "/_draft/view" }))
    ).toBe(true);
  });

  it("does not persist transient 400 responses", function () {
    expect(pageCache._isCacheableStatus(200)).toBe(true);
    expect(pageCache._isCacheableStatus(301)).toBe(true);
    expect(pageCache._isCacheableStatus(404)).toBe(true);
    expect(pageCache._isCacheableStatus(400)).toBe(false);
    expect(pageCache._isCacheableStatus(500)).toBe(false);
  });

  it("varies cache keys by host, protocol, cacheID, and renderable blog state", function () {
    const base = {
      blog: { id: "blog-1", cacheID: 1 },
      template: { id: "SITE:diary", locals: {}, cdn: {} },
      url: "/",
      originalHost: "example.com",
      protocol: "https",
      headers: {},
      get: function () {
        return "example.com";
      },
    };

    const first = pageCache._createCacheKey(base);
    const second = pageCache._createCacheKey(
      Object.assign({}, base, { blog: { id: "blog-1", cacheID: 2 } })
    );
    const third = pageCache._createCacheKey(
      Object.assign({}, base, { protocol: "http" })
    );
    const fourth = pageCache._createCacheKey(
      Object.assign({}, base, {
        blog: { id: "blog-1", cacheID: 1, domain: "example.com" },
      })
    );
    const fifth = pageCache._createCacheKey(
      Object.assign({}, base, {
        blog: { id: "blog-1", cacheID: 1, avatar: "/_avatars/new.jpg" },
      })
    );
    const sixth = pageCache._createCacheKey(base, "redirects-2");

    expect(first).not.toEqual(second);
    expect(first).not.toEqual(third);
    expect(first).not.toEqual(fourth);
    expect(first).not.toEqual(fifth);
    expect(first).not.toEqual(sixth);
  });
});

describe("fromCloudflare", function () {
  it("detects common Cloudflare headers without allocating arrays", function () {
    expect(fromCloudflare({ headers: { "cf-connecting-ip": "1.2.3.4" } })).toBe(true);
    expect(fromCloudflare({ headers: { "cf-ray": "abc" } })).toBe(true);
    expect(fromCloudflare({ headers: { host: "example.com" } })).toBe(false);
    expect(fromCloudflare({ headers: {} })).toBe(false);
  });
});

describe("replaceFolderLinks early-out", function () {
  it("skips HTML that has no folder-file attributes", function () {
    expect(replaceFolderLinks._mightContainFolderFiles("<p>Hello</p>")).toBe(false);
    expect(
      replaceFolderLinks._mightContainFolderFiles('<a href="/about">About</a>')
    ).toBe(false);
    expect(
      replaceFolderLinks._mightContainFolderFiles('<img src="/images/test.jpg">')
    ).toBe(true);
    expect(
      replaceFolderLinks._mightContainFolderFiles('<img src="/100% luck.jpg">')
    ).toBe(true);
    expect(
      replaceFolderLinks._mightContainFolderFiles('<IMG SRC="/photo.jpg">')
    ).toBe(true);
    expect(
      replaceFolderLinks._mightContainFolderFiles('<A HREF="/document.pdf">')
    ).toBe(true);
  });

  it("varies rewritten HTML cache keys by the blog host set", function () {
    const html = '<a href="/files/notes.pdf">notes</a>';
    const first = replaceFolderLinks._rewriteCacheKey(
      { id: "blog-1", cacheID: 1, handle: "alice" },
      html
    );
    const second = replaceFolderLinks._rewriteCacheKey(
      { id: "blog-1", cacheID: 1, handle: "alice", domain: "example.com" },
      html
    );
    expect(first).not.toEqual(second);
  });
});

describe("mustache token size", function () {
  it("walks token trees without serializing them", function () {
    expect(main._tokenSize("hello")).toBe(5);
    expect(main._tokenSize(["name", "title", 0, 5])).toBeGreaterThan(16);
  });
});
