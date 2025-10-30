const { promisify } = require("util");
describe("template", function () {
  require("./setup")({ createTemplate: true });

  const setMetadata = promisify(require("../index").setMetadata);
  const getMetadata = promisify(require("../index").getMetadata);
  const getBlog = promisify(require("models/blog").get);

  it("sets a template's metadata", async function () {
    var updates = { description: this.fake.random.word() };
    await setMetadata(this.template.id, updates);
    const template = await getMetadata(this.template.id);
    expect(template.description).toEqual(updates.description);
  });

  it("updates the cache ID of the blog which owns a template after updating", async function () {
    var initialCacheID = this.blog.cacheID;
    var updates = { description: this.fake.random.word() };
    await setMetadata(this.template.id, updates);
    const blog = await getBlog({ id: this.template.owner });
    expect(blog.cacheID).not.toEqual(initialCacheID);
  });

  it("it will inject the font styles when you simply supply an id", async function () {
    var updates = { locals: { body_font: { id: "system-sans" } } };
    await setMetadata(this.template.id, updates);
    const { locals } = await getMetadata(this.template.id);
    const { body_font } = locals;
    expect(body_font.name).toEqual("System sans-serif");
    expect(body_font.stack).toContain("-apple-system");
    expect(body_font.styles).toEqual("");
    expect(body_font.line_height).toEqual(1.4);
    expect(body_font.font_size).toEqual(16);
    expect(body_font.line_width).toEqual(38);
  });

  it("it will inject the syntax highlighter styles when you simply supply an id", async function () {
    var updates = { locals: { syntax_highlighter: { id: "agate" } } };
    await setMetadata(this.template.id, updates);
    const { locals } = await getMetadata(this.template.id);
    const { syntax_highlighter } = locals;
    expect(syntax_highlighter.id).toEqual("agate");
    expect(syntax_highlighter.styles).toContain(".hljs{");
  });

});
