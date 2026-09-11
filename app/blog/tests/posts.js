const entriesModel = require("models/entries");
const postsRetrieve = require("../render/retrieve/posts");

describe("posts", function () {
  describe("rendering", function () {
    require("./util/setup")();

    it("lists entries via the posts local", async function () {
      await this.publish({ path: "/a.txt", content: "Hello, A!" });
      await this.publish({ path: "/b.txt", content: "Hello, B!" });
      await this.publish({ path: "/c.txt", content: "Hello, C!" });

      await this.template({
        "entries.html": "{{#posts}}{{{html}}}{{/posts}}",
      });

      const body = await this.text("/");
      expect(body).toContain("Hello, A!");
      expect(body).toContain("Hello, B!");
      expect(body).toContain("Hello, C!");
    });

    it("paginates according to page_size", async function () {
      await this.publish({ path: "/c.txt", content: "Hello, C!" });
      await this.publish({ path: "/b.txt", content: "Hello, B!" });
      await this.publish({ path: "/a.txt", content: "Hello, A!" });

      await this.template(
        { "entries.html": "{{#posts}}{{{html}}}{{/posts}}" },
        { locals: { page_size: 2 } }
      );

      const page1 = await this.text("/");
      expect(page1).toContain("Hello, A!");
      expect(page1).toContain("Hello, B!");
      expect(page1).not.toContain("Hello, C!");

      const page2 = await this.text("/page/2");
      expect(page2).not.toContain("Hello, A!");
      expect(page2).not.toContain("Hello, B!");
      expect(page2).toContain("Hello, C!");
    });

    it("exposes pagination alongside the posts local", async function () {
      const totalEntries = 5;
      const page_size = 2;

      for (let i = totalEntries; i > 0; i--) {
        await this.publish({ path: `/${i}.txt`, content: `Hello, ${i}!` });
      }

      await this.template(
        {
          "entries.html":
            "{{#posts}}{{/posts}}{{pagination.current}}/{{pagination.total}}/{{pagination.total_entries}}",
        },
        { locals: { page_size } }
      );

      const body = await this.text("/page/1");
      expect(body).toContain("1/3/5");
    });

    it("filters to a single tag via the query string", async function () {
      await this.publish({ path: "/first.txt", content: "Tags: A\n\nFoo" });
      await this.publish({
        path: "/second.txt",
        content: "Tags: A,B\n\nBar",
      });
      await this.publish({ path: "/third.txt", content: "Tags: B\n\nBaz" });

      await this.template({
        "entries.html": "{{#posts}}{{title}} {{/posts}}",
      });

      const body = await this.text("/?tag=a");
      const titles = body.trim().toLowerCase();

      expect(titles).toContain("second");
      expect(titles).toContain("first");
      expect(titles).not.toContain("third");
    });

    it("does not serve a stale post list after new content is synced", async function () {
      // Use the real incremental sync path (as a live customer publish would),
      // not rebuild - see app/sync/index.js, which bumps blog.cacheID at the
      // end of a sync and is what actually busts the posts cache below.
      await this.write({ path: "/a.txt", content: "Hello, A!" });

      await this.template({
        "entries.html": "{{#posts}}{{{html}}}{{/posts}}",
      });

      const before = await this.text("/");
      expect(before).toContain("Hello, A!");
      expect(before).not.toContain("Hello, B!");

      await this.write({ path: "/b.txt", content: "Hello, B!" });

      const after = await this.text("/");
      expect(after).toContain("Hello, A!");
      expect(after).toContain("Hello, B!");
    });
  });

  describe("caching", function () {
    beforeEach(function () {
      postsRetrieve._clear();
    });

    function fakeReqRes(overrides = {}) {
      return {
        req: Object.assign(
          {
            blog: { id: "blog-1", cacheID: 111 },
            template: { locals: {} },
            params: {},
            query: {},
            log: () => {},
          },
          overrides.req
        ),
        res: Object.assign({ locals: {} }, overrides.res),
      };
    }

    it("reuses cached results for identical requests", function (done) {
      const entries = [{ id: "/a.txt", title: "A", html: "<p>A</p>" }];

      spyOn(entriesModel, "getPage").and.callFake(function (
        blogID,
        options,
        callback
      ) {
        callback(null, entries, { current: 1, total: 1 });
      });

      const { req, res } = fakeReqRes();

      postsRetrieve(req, res, function (err, firstResult) {
        expect(err).toBeNull();
        expect(firstResult).toEqual(entries);

        const { req: req2, res: res2 } = fakeReqRes();

        postsRetrieve(req2, res2, function (secondErr, secondResult) {
          expect(secondErr).toBeNull();
          expect(secondResult).toEqual(entries);
          expect(entriesModel.getPage).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it("returns isolated copies so caller mutations do not taint the cache", function (done) {
      spyOn(entriesModel, "getPage").and.callFake(function (
        blogID,
        options,
        callback
      ) {
        callback(null, [{ id: "/a.txt", title: "Original" }], { current: 1 });
      });

      const { req, res } = fakeReqRes();

      postsRetrieve(req, res, function (err, firstResult) {
        firstResult[0].title = "Mutated";

        const { req: req2, res: res2 } = fakeReqRes();

        postsRetrieve(req2, res2, function (secondErr, secondResult) {
          expect(secondResult[0].title).toBe("Original");
          expect(entriesModel.getPage).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it("misses the cache when blog.cacheID changes", function (done) {
      spyOn(entriesModel, "getPage").and.callFake(function (
        blogID,
        options,
        callback
      ) {
        callback(null, [], { current: 1 });
      });

      const { req, res } = fakeReqRes();

      postsRetrieve(req, res, function () {
        const { req: req2, res: res2 } = fakeReqRes({
          req: { blog: { id: "blog-1", cacheID: 222 } },
        });

        postsRetrieve(req2, res2, function () {
          expect(entriesModel.getPage).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it("misses the cache when the two blogs are different", function (done) {
      spyOn(entriesModel, "getPage").and.callFake(function (
        blogID,
        options,
        callback
      ) {
        callback(null, [], { current: 1 });
      });

      const { req, res } = fakeReqRes();

      postsRetrieve(req, res, function () {
        const { req: req2, res: res2 } = fakeReqRes({
          req: { blog: { id: "blog-2", cacheID: 111 } },
        });

        postsRetrieve(req2, res2, function () {
          expect(entriesModel.getPage).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it("misses the cache when the requested page differs", function (done) {
      spyOn(entriesModel, "getPage").and.callFake(function (
        blogID,
        options,
        callback
      ) {
        callback(null, [], { current: options.pageNumber });
      });

      const { req, res } = fakeReqRes({ req: { params: { page: "1" } } });

      postsRetrieve(req, res, function () {
        const { req: req2, res: res2 } = fakeReqRes({
          req: { params: { page: "2" } },
        });

        postsRetrieve(req2, res2, function () {
          expect(entriesModel.getPage).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it("does not fetch a page of entries when a tag is present", function (done) {
      spyOn(entriesModel, "getPage");

      const { req, res } = fakeReqRes({ req: { query: { tag: "design" } } });

      postsRetrieve(req, res, function (err) {
        // No entries with this tag exist, so we expect an empty result
        // rather than an error, and the untagged code path must not run.
        expect(err).toBeNull();
        expect(entriesModel.getPage).not.toHaveBeenCalled();
        done();
      });
    });

    it("builds equal cache keys regardless of tag array order", function () {
      const base = {
        branch: "tagged",
        sortBy: undefined,
        order: undefined,
        pathPrefix: undefined,
        pageNumber: 1,
        pageSize: 100,
        limit: 100,
        offset: 0,
      };

      const keyA = postsRetrieve._createCacheKey(
        { blog: { id: "blog-1", cacheID: 111 } },
        {},
        Object.assign({}, base, { tags: ["a", "b"] })
      );

      const keyB = postsRetrieve._createCacheKey(
        { blog: { id: "blog-1", cacheID: 111 } },
        {},
        Object.assign({}, base, { tags: ["b", "a"] })
      );

      expect(keyA).toBe(keyB);
    });

    it("builds different cache keys for different tags", function () {
      const base = {
        branch: "tagged",
        sortBy: undefined,
        order: undefined,
        pathPrefix: undefined,
        pageNumber: 1,
        pageSize: 100,
        limit: 100,
        offset: 0,
      };

      const keyA = postsRetrieve._createCacheKey(
        { blog: { id: "blog-1", cacheID: 111 } },
        {},
        Object.assign({}, base, { tags: ["a"] })
      );

      const keyB = postsRetrieve._createCacheKey(
        { blog: { id: "blog-1", cacheID: 111 } },
        {},
        Object.assign({}, base, { tags: ["b"] })
      );

      expect(keyA).not.toBe(keyB);
    });
  });
});
