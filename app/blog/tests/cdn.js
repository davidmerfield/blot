const config = require("config");

describe("cdn manifest integration", function () {
  require("./util/setup")();

  it("renders CDN URLs and serves hashed assets", async function () {
    await this.template({
      "entries.html": `<span id="cdn-host">{{{cdn}}}</span>\n<link rel="stylesheet" href="{{#cdn}}style.css{{/cdn}}">`,
      "style.css": "body { color: red; }",
    });

    const index = await this.text("/");

    expect(index).toContain(`<span id="cdn-host">${config.cdn.origin}</span>`);

    const match = index.match(/href="([^"]+)"/);
    const cdnURL = match && match[1];

    expect(cdnURL).toContain(config.cdn.origin);
    expect(cdnURL).toContain("/view/");
    expect(cdnURL).toContain("/style.css");
    expect(cdnURL).toMatch(/\/v-[a-f0-9]+\.css$/);
  });
});
