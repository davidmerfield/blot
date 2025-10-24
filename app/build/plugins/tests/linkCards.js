const { join } = require("path");
const fs = require("fs-extra");
const nock = require("nock");
const cheerio = require("cheerio");
const config = require("config");
const build = require("build");
const Transformer = require("helper/transformer");
const sharp = require("sharp");

require("../../tests/plugins/util/setup")();

function pluginOptions(overrides = {}) {
  return Object.assign(
    {
      layout: "compact",
      layoutCompact: true,
      layoutLarge: false,
    },
    overrides
  );
}

async function createTestImage(width = 1200, height = 630) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 200, b: 220 },
    },
  })
    .png()
    .toBuffer();
}

async function buildEntry(context, path, contents) {
  fs.outputFileSync(context.blogDirectory + path, contents);

  return new Promise((resolve, reject) => {
    build(context.blog, path, (err, entry) => {
      if (err) return reject(err);
      resolve(entry);
    });
  });
}

describe("link cards plugin", function () {
  beforeEach(function () {
    this.cacheDirectory = join(
      config.blog_static_files_dir,
      this.blog.id,
      "_link_cards"
    );
    this.thumbnailDirectory = join(
      config.blog_static_files_dir,
      this.blog.id,
      "link_cards"
    );

    fs.removeSync(this.cacheDirectory);
    fs.removeSync(this.thumbnailDirectory);
    nock.cleanAll();
    nock.disableNetConnect();
    nock.enableNetConnect("127.0.0.1");
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  afterEach(function (done) {
    const metadataTransformer = new Transformer(this.blog.id, "link-cards");
    const thumbnailTransformer = new Transformer(
      this.blog.id,
      "link-cards-thumbnails"
    );

    metadataTransformer.flush(() => {
      thumbnailTransformer.flush(done);
    });
  });

  it("fetches metadata and renders a compact card", async function () {
    const imageBuffer = await createTestImage();
    const scope = nock("https://example.com")
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
    const imageScope = nock("https://example.com")
      .get("/image.png")
      .reply(200, imageBuffer, { "Content-Type": "image/png" });

    this.blog.plugins.linkCards = { enabled: true, options: pluginOptions() };

    const entry = await buildEntry(
      this,
      "/post.txt",
      '<p><a href="https://example.com/post">https://example.com/post</a></p>'
    );

    expect(scope.isDone()).toBe(true);
    expect(imageScope.isDone()).toBe(true);

    const $ = cheerio.load(entry.html);
    const card = $("article.link-card");

    expect(card.length).toBe(1);
    expect(card.hasClass("link-card--compact")).toBe(true);
    expect(card.find(".link-card__title").text()).toBe("Example Page");
    expect(card.find(".link-card__description").text()).toBe(
      "An example description."
    );
    const image = card.find(".link-card__thumbnail img");
    const src = image.attr("src");
    const srcset = image.attr("srcset");
    expect(src.startsWith(`${config.cdn.origin}/${this.blog.id}/link_cards/`)).toBe(
      true
    );
    expect(srcset).toContain("w");
    expect(card.find(".link-card__url").text()).toBe("example.com/post");
    expect(fs.existsSync(this.thumbnailDirectory)).toBe(true);
    expect(fs.readdirSync(this.thumbnailDirectory).length).toBeGreaterThan(0);
  });

  it("respects the selected large layout", async function () {
    const scope = nock("https://layout.test")
      .get("/")
      .reply(
        200,
        `<!doctype html><html><head>
          <title>Layout Test</title>
        </head><body></body></html>`
      );

    this.blog.plugins.linkCards = {
      enabled: true,
      options: pluginOptions({
        layout: "large",
        layoutCompact: false,
        layoutLarge: true,
      }),
    };

    const entry = await buildEntry(
      this,
      "/layout.txt",
      '<p><a href="https://layout.test/">https://layout.test/</a></p>'
    );

    expect(scope.isDone()).toBe(true);

    const $ = cheerio.load(entry.html);
    const card = $("article.link-card");

    expect(card.length).toBe(1);
    expect(card.hasClass("link-card--large")).toBe(true);
    expect(card.find(".link-card__thumbnail").length).toBe(0);
    expect(card.find(".link-card__title").text()).toBe("Layout Test");
  });

  it("reuses cached metadata when available", async function () {
    const target = "https://cached.example.com/post";
    const imageBuffer = await createTestImage(800, 400);

    const initial = nock("https://cached.example.com")
      .get("/post")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Cached Title" />
          <meta name="description" content="Cached description" />
          <meta property="og:image" content="/image.png" />
        </head><body></body></html>`
      );
    const initialImage = nock("https://cached.example.com")
      .get("/image.png")
      .reply(200, imageBuffer, { "Content-Type": "image/png" });

    this.blog.plugins.linkCards = { enabled: true, options: pluginOptions() };

    await buildEntry(
      this,
      "/cached.txt",
      `<p><a href="${target}">${target}</a></p>`
    );

    expect(initial.isDone()).toBe(true);
    expect(initialImage.isDone()).toBe(true);
    expect(fs.existsSync(this.cacheDirectory)).toBe(true);
    expect(fs.readdirSync(this.cacheDirectory).length).toBeGreaterThan(0);

    nock.cleanAll();
    nock.disableNetConnect();
    nock.enableNetConnect("127.0.0.1");

    const unexpected = nock("https://cached.example.com").get("/post");
    const unexpectedImage = nock("https://cached.example.com").get(
      "/image.png"
    );

    const entry = await buildEntry(
      this,
      "/cached.txt",
      `<p><a href="${target}">${target}</a></p>`
    );

    expect(unexpected.isDone()).toBe(false);
    expect(unexpectedImage.isDone()).toBe(false);

    const $ = cheerio.load(entry.html);
    const image = $(".link-card__thumbnail img");
    expect($(".link-card__title").text()).toBe("Cached Title");
    expect($(".link-card__description").text()).toBe("Cached description");
    expect(image.attr("src")).toMatch(
      new RegExp(`${this.blog.id}/link_cards/`)
    );
  });

  it("falls back gracefully when metadata cannot be fetched", async function () {
    nock("https://failure.test").get("/").reply(500);

    this.blog.plugins.linkCards = { enabled: true, options: pluginOptions() };

    const entry = await buildEntry(
      this,
      "/failure.txt",
      '<p><a href="https://failure.test/">https://failure.test/</a></p>'
    );

    const $ = cheerio.load(entry.html);
    const card = $("article.link-card");

    expect(card.length).toBe(1);
    expect(card.find(".link-card__title").text()).toBe("failure.test");
    expect(card.find(".link-card__description").text()).toBe("");
    expect(card.find(".link-card__thumbnail").length).toBe(0);
  });

  it("reuses transformer metadata when the remote request fails", async function () {
    const target = "https://transformer-cache.test/post";

    const initial = nock("https://transformer-cache.test")
      .get("/post")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Transformer Title" />
        </head><body></body></html>`
      );

    this.blog.plugins.linkCards = { enabled: true, options: pluginOptions() };

    await buildEntry(
      this,
      "/transformer.txt",
      `<p><a href="${target}">${target}</a></p>`
    );

    expect(initial.isDone()).toBe(true);

    fs.removeSync(this.cacheDirectory);

    nock.cleanAll();
    nock.disableNetConnect();
    nock.enableNetConnect("127.0.0.1");

    nock("https://transformer-cache.test").get("/post").reply(500);

    const entry = await buildEntry(
      this,
      "/transformer.txt",
      `<p><a href="${target}">${target}</a></p>`
    );

    const $ = cheerio.load(entry.html);
    expect($(".link-card__title").text()).toBe("Transformer Title");
  });

  it("ignores unsafe image protocols", async function () {
    const scope = nock("https://unsafe-image.test")
      .get("/post")
      .reply(
        200,
        `<!doctype html><html><head>
          <meta property="og:title" content="Unsafe Image" />
          <meta property="og:image" content="javascript:alert(1)" />
        </head><body></body></html>`
      );

    this.blog.plugins.linkCards = { enabled: true, options: pluginOptions() };

    const entry = await buildEntry(
      this,
      "/unsafe.txt",
      '<p><a href="https://unsafe-image.test/post">https://unsafe-image.test/post</a></p>'
    );

    expect(scope.isDone()).toBe(true);

    const $ = cheerio.load(entry.html);
    expect($(".link-card__thumbnail").length).toBe(0);
  });
});
