const Blog = require("models/blog");
const Template = require("models/template");
const Entry = require("models/entry");
const Entries = require("models/entries");
const client = require("models/client");
const models = require("../models");
const EntryInstance = require("models/entry/instance");

describe("blog model adapter caches", function () {
  beforeEach(function () {
    models._clear();
  });

  afterEach(function () {
    models._clear();
  });

  it("reuses a blog when the redis hash is unchanged", async function () {
    const blog = { id: "blog-1", cacheID: 100, handle: "alice" };
    const raw = { id: "blog-1", cacheID: "100", handle: "alice" };
    spyOn(client, "get").and.returnValue(Promise.resolve("blog-1"));
    spyOn(client, "hGetAll").and.returnValue(Promise.resolve(raw));
    spyOn(Blog, "get").and.callFake((by, cb) => {
      cb(null, Object.assign({}, blog));
    });

    const first = await models.getBlog({ handle: "alice" });
    const second = await models.getBlog({ handle: "alice" });

    expect(Blog.get.calls.count()).toEqual(1);
    expect(client.hGetAll.calls.count()).toEqual(2);
    expect(first.handle).toEqual("alice");
    expect(second.handle).toEqual("alice");
    first.handle = "mutated";
    expect(second.handle).toEqual("alice");
  });

  it("refetches the blog when a hash field changes", async function () {
    spyOn(client, "get").and.returnValue(Promise.resolve("blog-1"));
    spyOn(client, "hGetAll").and.callFake(() => {
      if (client.hGetAll.calls.count() === 1) {
        return Promise.resolve({
          id: "blog-1",
          cacheID: "100",
          handle: "alice",
          domain: "",
        });
      }
      return Promise.resolve({
        id: "blog-1",
        cacheID: "100",
        handle: "alice",
        domain: "example.com",
      });
    });
    spyOn(Blog, "get").and.callFake((by, cb) => {
      const domain = Blog.get.calls.count() === 1 ? "" : "example.com";
      cb(null, { id: "blog-1", cacheID: 100, handle: "alice", domain });
    });

    const first = await models.getBlog({ handle: "alice" });
    const second = await models.getBlog({ handle: "alice" });

    expect(first.domain).toEqual("");
    expect(second.domain).toEqual("example.com");
    expect(Blog.get.calls.count()).toEqual(2);
  });

  it("reuses template metadata for the same cacheID", async function () {
    spyOn(Template, "getMetadata").and.callFake((id, cb) => {
      cb(null, { locals: { page_size: 5 }, owner: "SITE", cdn: {} });
    });

    const first = await models.getMetadata("SITE:diary", 111);
    const second = await models.getMetadata("SITE:diary", 111);
    expect(Template.getMetadata.calls.count()).toEqual(1);
    first.locals.page_size = 9;
    expect(second.locals.page_size).toEqual(5);

    await models.getMetadata("SITE:diary", 112);
    expect(Template.getMetadata.calls.count()).toEqual(2);
  });

  it("does not cache template metadata without a cacheID", async function () {
    spyOn(Template, "getMetadata").and.callFake((id, cb) => {
      cb(null, { locals: {}, owner: "SITE" });
    });

    await models.getMetadata("SITE:diary");
    await models.getMetadata("SITE:diary");
    expect(Template.getMetadata.calls.count()).toEqual(2);
  });

  it("reuses view-by-url matches for the same cacheID", async function () {
    spyOn(Template, "getViewByURL").and.callFake((template, url, cb) => {
      cb(null, "archives.html", { page: "1" });
    });

    const first = await models.getViewByURL("SITE:diary", "/archives", 111);
    const second = await models.getViewByURL("SITE:diary", "/archives", 111);
    expect(Template.getViewByURL.calls.count()).toEqual(1);
    expect(second.viewName).toEqual("archives.html");
    expect(second.params.page).toEqual("1");
  });

  it("reuses entry-by-url hits and isolates clones", async function () {
    spyOn(Entry, "getByUrl").and.callFake((blogID, url, cb) => {
      const entry = new EntryInstance();
      entry.title = "Hello";
      entry.url = "/hello";
      cb(entry);
    });

    const first = await models.getEntryByUrl("blog-1", "/hello", 111);
    const second = await models.getEntryByUrl("blog-1", "/hello", 111);
    expect(Entry.getByUrl.calls.count()).toEqual(1);
    expect(second instanceof EntryInstance).toBe(true);
    first.title = "Changed";
    expect(second.title).toEqual("Hello");
  });

  it("reuses a short-lived entry miss", async function () {
    spyOn(Entry, "getByUrl").and.callFake((blogID, url, cb) => cb(null));

    const first = await models.getEntryByUrl("blog-1", "/missing", 111);
    const second = await models.getEntryByUrl("blog-1", "/missing", 111);

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(Entry.getByUrl.calls.count()).toEqual(1);
  });

  it("reuses adjacent entries for the same cacheID", async function () {
    spyOn(Entries, "adjacentTo").and.callFake((blogID, entryID, cb) => {
      const next = new EntryInstance();
      next.title = "Next";
      cb(next, null, 2);
    });

    const first = await models.adjacentTo("blog-1", "/a.txt", 111);
    const second = await models.adjacentTo("blog-1", "/a.txt", 111);
    expect(Entries.adjacentTo.calls.count()).toEqual(1);
    expect(second.next instanceof EntryInstance).toBe(true);
    first.next.title = "Changed";
    expect(second.next.title).toEqual("Next");
  });
});
