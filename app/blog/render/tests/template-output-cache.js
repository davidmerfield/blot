const getTemplateOutputCache = require("../template-output-cache");

describe("template output cache", function () {
  beforeEach(function () {
    getTemplateOutputCache._clear();
  });

  it("reuses cached output for identical inputs", async function () {
    const compute = jasmine.createSpy("compute").and.callFake(async () => "output");

    const options = {
      blog: { id: "blog-1", cacheID: 111 },
      template: { id: "template-1" },
      viewName: "style.css",
      compute,
    };

    const first = await getTemplateOutputCache(options);
    const second = await getTemplateOutputCache(options);

    expect(first).toBe("output");
    expect(second).toBe("output");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("misses the cache when blog/template/view inputs differ", async function () {
    const compute = jasmine
      .createSpy("compute")
      .and.callFake(async () => "output");

    await getTemplateOutputCache({
      blog: { id: "blog-1", cacheID: 111 },
      template: { id: "template-1" },
      viewName: "style.css",
      compute,
    });

    await getTemplateOutputCache({
      blog: { id: "blog-2", cacheID: 111 },
      template: { id: "template-2" },
      viewName: "script.js",
      compute,
    });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("recomputes when blog.cacheID changes", async function () {
    const compute = jasmine
      .createSpy("compute")
      .and.callFake(async () => String(Date.now()));

    await getTemplateOutputCache({
      blog: { id: "blog-1", cacheID: 111 },
      template: { id: "template-1" },
      viewName: "style.css",
      compute,
    });

    await getTemplateOutputCache({
      blog: { id: "blog-1", cacheID: 222 },
      template: { id: "template-1" },
      viewName: "style.css",
      compute,
    });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does not collide cache keys when input segments contain colons", function () {
    const firstKey = getTemplateOutputCache._createCacheKey(
      { id: "foo:bar", cacheID: "baz" },
      { id: "qux" },
      "view"
    );

    const secondKey = getTemplateOutputCache._createCacheKey(
      { id: "foo", cacheID: "bar:baz" },
      { id: "qux" },
      "view"
    );

    expect(firstKey).not.toBe(secondKey);
  });
});

describe("template output cache - shared template across blogs", function () {
  beforeEach(function () {
    getTemplateOutputCache._clear();
  });

  // The key is always {viewing blogID, blog's own cacheID, templateID,
  // viewName} - blogID is always the *viewing* blog, exactly like
  // full-view-cache.js. Two different blogs sharing the same SITE/public
  // template (same templateID) must therefore each resolve and cache
  // their own folder's CSS output, never the other blog's.
  it("resolves each viewing blog's own output without colliding, even for the same shared template", async function () {
    const sharedTemplate = { id: "shared-template" };

    const computeForBlogA = jasmine
      .createSpy("computeForBlogA")
      .and.callFake(async () => ".test { background: url(/folder/blog-a/font.woff2); }");

    const computeForBlogB = jasmine
      .createSpy("computeForBlogB")
      .and.callFake(async () => ".test { background: url(/folder/blog-b/font.woff2); }");

    const outputA = await getTemplateOutputCache({
      blog: { id: "blog-a", cacheID: 111 },
      template: sharedTemplate,
      viewName: "style.css",
      compute: computeForBlogA,
    });

    const outputB = await getTemplateOutputCache({
      blog: { id: "blog-b", cacheID: 111 },
      template: sharedTemplate,
      viewName: "style.css",
      compute: computeForBlogB,
    });

    expect(outputA).toContain("/folder/blog-a/font.woff2");
    expect(outputB).toContain("/folder/blog-b/font.woff2");
    expect(computeForBlogA).toHaveBeenCalledTimes(1);
    expect(computeForBlogB).toHaveBeenCalledTimes(1);

    // Repeat requests for each blog hit their own cache entry, not the
    // other blog's.
    const outputARepeat = await getTemplateOutputCache({
      blog: { id: "blog-a", cacheID: 111 },
      template: sharedTemplate,
      viewName: "style.css",
      compute: computeForBlogA,
    });

    expect(outputARepeat).toContain("/folder/blog-a/font.woff2");
    expect(computeForBlogA).toHaveBeenCalledTimes(1);
  });
});
