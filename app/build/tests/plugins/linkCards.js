const sharp = require("sharp");
const nock = require("nock");

describe("link cards plugin", function () {
  require("./util/setup")();

  beforeEach(function () {
    nock.cleanAll();
    nock.disableNetConnect();
    nock.enableNetConnect("127.0.0.1");
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("fetches metadata and renders a compact card", async function () {
    const imageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 180, g: 200, b: 220 },
      },
    })
      .png()
      .toBuffer();

    nock("https://example.com")
      .get("/post")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Example Page" />
          <meta property="og:description" content="An example description." />
          <meta property="og:image" content="/image.png" />
          <meta property="og:site_name" content="Example" />
        </head><body></body></html>`
      );

    nock("https://example.com")
      .get("/image.png")
      .reply(200, imageBuffer, { "Content-Type": "image/png" });

    const content = "[https://example.com/post](https://example.com/post)";
    const path = "/hello.txt";

    await this.blog.update({
      plugins: {
        ...this.blog.plugins,
        linkCards: { enabled: true, options: {} },
      },
    });
    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain(
      '<article class="link-card link-card--compact"><a class="link-card__anchor" href="https://example.com/post" rel="noopener noreferrer"><div class="link-card__thumbnail"><img src="'
    );

    expect(entry.html).toContain(
      '<div class="link-card__content"><h3 class="link-card__title">Example Page</h3><p class="link-card__description">An example description.</p><span class="link-card__url"><span class="link-card__url-text">Example</span></span></div></a></article>'
    );
  });

  it("respects the selected large layout", async function () {
    const imageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 180, g: 200, b: 220 },
      },
    })
      .png()
      .toBuffer();

    nock("https://example.com")
      .get("/large")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Large Layout" />
          <meta property="og:description" content="Rendered with the large layout." />
          <meta property="og:image" content="/image.png" />
          <meta property="og:site_name" content="Example" />
        </head><body></body></html>`
      );

    nock("https://example.com")
      .get("/image.png")
      .reply(200, imageBuffer, { "Content-Type": "image/png" });

    const content = "[https://example.com/large](https://example.com/large)";
    const path = "/large.txt";

    await this.blog.update({
      plugins: {
        ...this.blog.plugins,
        linkCards: {
          enabled: true,
          options: {
            layout: "large",
            layoutCompact: false,
            layoutLarge: true,
          },
        },
      },
    });

    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain(
      '<article class="link-card link-card--large"><a class="link-card__anchor" href="https://example.com/large" rel="noopener noreferrer"><div class="link-card__thumbnail">'
    );
    expect(entry.html).toContain(
      '<div class="link-card__content"><h3 class="link-card__title">Large Layout</h3><p class="link-card__description">Rendered with the large layout.</p><span class="link-card__url"><span class="link-card__url-text">Example</span></span></div></a></article>'
    );
  });

  it("ignores unsafe image protocols", async function () {
    nock("https://example.com")
      .get("/unsafe")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Example Page" />
          <meta property="og:description" content="An example description." />
          <meta property="og:image" content="javascript:alert(1)" />
          <meta property="og:site_name" content="Example" />
        </head><body></body></html>`
      );

    const content = "[https://example.com/unsafe](https://example.com/unsafe)";
    const path = "/unsafe.txt";

    await this.blog.update({
      plugins: {
        ...this.blog.plugins,
        linkCards: {
          enabled: true,
          options: {
            layout: "compact",
            layoutCompact: true,
            layoutLarge: false,
          },
        },
      },
    });

    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toBe(
      '<article class="link-card link-card--compact"><a class="link-card__anchor" href="https://example.com/unsafe" rel="noopener noreferrer"><div class="link-card__content"><h3 class="link-card__title">Example Page</h3><p class="link-card__description">An example description.</p><span class="link-card__url"><span class="link-card__url-text">Example</span></span></div></a></article>'
    );
    expect(entry.html).not.toContain("link-card__thumbnail");
    expect(entry.html).not.toContain("javascript:alert(1)");
  });

  it("falls back to a hostname-only card when metadata cannot be fetched", async function () {
    nock("https://example.com").get("/missing").reply(500);

    const content = "[https://example.com/missing](https://example.com/missing)";
    const path = "/missing.txt";

    await this.blog.update({
      plugins: {
        ...this.blog.plugins,
        linkCards: { enabled: true, options: {} },
      },
    });
    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toBe(
      '<article class="link-card link-card--compact"><a class="link-card__anchor" href="https://example.com/missing" rel="noopener noreferrer"><div class="link-card__content"><h3 class="link-card__title">example.com</h3><span class="link-card__url"><span class="link-card__url-text">example.com</span></span></div></a></article>'
    );
    expect(entry.html).not.toContain("link-card__thumbnail");
  });

  it("is enabled by default for new blogs", function () {
    const { defaultList } = require("build/plugins");
    expect(defaultList.linkCards.enabled).toBe(true);
  });

  describe("URL guards", function () {
    const cheerio = require("cheerio");
    const { shouldTransform } = require("build/plugins/linkCards/dom");
    const {
      sanitizeRemoteURL,
    } = require("build/plugins/linkCards/metadata");

    function anchor(href) {
      const $ = cheerio.load(`<p><a href="${href}">${href}</a></p>`, null, false);
      return { $, el: $("a")[0] };
    }

    it("does not transform a link that carries credentials", function () {
      const { $, el } = anchor("https://user:pass@example.com/secret");
      expect(shouldTransform($, el, { domain: "blog.example" })).toBe(false);
    });

    it("still transforms an ordinary external link", function () {
      const { $, el } = anchor("https://example.com/post");
      expect(shouldTransform($, el, { domain: "blog.example" })).toBe(true);
    });

    it("drops credentialed and non-http(s) remote asset URLs", function () {
      expect(
        sanitizeRemoteURL("https://user:pass@cdn.example/og.png", "https://example.com")
      ).toBe("");
      expect(
        sanitizeRemoteURL("javascript:alert(1)", "https://example.com")
      ).toBe("");
      expect(
        sanitizeRemoteURL("https://cdn.example/og.png", "https://example.com")
      ).toBe("https://cdn.example/og.png");
    });
  });
});
