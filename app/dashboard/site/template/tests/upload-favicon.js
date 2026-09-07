describe("upload favicon", function () {
  global.test.blog();
  global.test.tmp();

  const fs = require("fs-extra");
  const { join } = require("path");
  const sharp = require("sharp");
  const Template = require("models/template");
  const uploadFavicon = require("../save/upload-favicon");

  afterEach(function () {
    if (Template.update.and) Template.update.and.callThrough();
  });

  it("stores generated favicon URLs in the template locals", async function () {
    const source = join(this.tmp, "favicon.png");
    await sharp({ create: { width: 200, height: 100, channels: 4, background: "#2244ff" } }).png().toFile(source);
    const locals = {};
    const req = {
      blog: this.blog,
      params: { templateSlug: "test" },
      template: { locals },
      files: { favicon: [{ path: source, size: (await fs.stat(source)).size }] },
      body: { crop_x: "0.25", crop_y: "0", crop_size: "1" },
      query: { ajax: "1" },
    };
    const result = {};
    const res = { json: (body) => { result.body = body; } };
    const next = jasmine.createSpy("next");
    spyOn(Template, "update").and.callFake((_blogID, _slug, data, callback) => callback());

    await uploadFavicon(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(Template.update).toHaveBeenCalledWith(this.blog.id, "test", { locals }, jasmine.any(Function));
    expect(result.body.favicon.ico).toMatch(/\.ico$/);
    expect(result.body.favicon.png16).toMatch(/-16\.png$/);
    expect(result.body.favicon.png32).toMatch(/-32\.png$/);
    expect(result.body.favicon.appleTouch).toMatch(/-180\.png$/);
  });
});
