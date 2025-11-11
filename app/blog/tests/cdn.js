const config = require("config");

describe("cdn manifest integration", function () {
  require("./util/setup")();

  it("renders CDN origin string", async function () {
    await this.template({
      "entries.html": `{{{cdn}}}`,
    });

    expect(await this.text("/")).toBe(config.cdn.origin);
  });

  it("renders CDN URLs", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "entries.html": "{{#cdn}}/style.css{{/cdn}}",
    });

    const cdnURL = await this.text("/");

    expect(cdnURL).toContain(config.cdn.origin);
    expect(cdnURL).toContain("/view/");
    expect(cdnURL).toContain("/style.css");
    expect(cdnURL).toMatch(/\/v-[a-f0-9]+\.css$/);
  });

  it("updates the CDN URL when the view changes", async function () {
    await this.template({
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "body { color: red; }",
    });

    const cdnURL = await this.text("/");

    expect(cdnURL).toContain(config.cdn.origin);

    await this.template({
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "body { color: purple; }",
    });

    const newCdnURL = await this.text("/");
    expect(newCdnURL).toContain(config.cdn.origin);

    expect(cdnURL).not.toBe(newCdnURL);
  });
});
