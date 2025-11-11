const express = require("express");
const { promisify } = require("util");
const Template = require("models/template");
const config = require("config");

describe("cdn manifest integration", function () {
  require("blog/tests/util/setup")();

  const getMetadata = promisify(Template.getMetadata);

  let cdnServer;
  let cdnOrigin;

  beforeAll(function (done) {
    const app = express();
    app.use(require("../../../cdn"));
    cdnServer = app.listen(0, () => {
      const address = cdnServer.address();
      cdnOrigin = `http://127.0.0.1:${address.port}`;
      done();
    });
  });

  afterAll(function (done) {
    if (!cdnServer) return done();
    cdnServer.close(done);
  });

  it("renders CDN URLs and serves hashed assets", async function () {
    await this.template({
      "index.html": `<span id="cdn-host">{{cdn}}</span>\n<link rel="stylesheet" href="{{#cdn}}style.css{{/cdn}}">`,
      "style.css": "body { color: red; }",
    });

    const templateID = this.blog.template;
    const metadata = await getMetadata(templateID);
    const hash = metadata.cdn["style.css"];

    expect(hash).toEqual(jasmine.any(String));

    const encodedTemplate = encodeURIComponent(templateID);
    const expectedPath = `/view/${encodedTemplate}/style.css/v-${hash}.css`;
    const expectedURL = `${config.cdn.origin}${expectedPath}`;

    const res = await this.get("/");
    const body = await res.text();

    expect(body).toContain(`<span id="cdn-host">${config.cdn.origin}</span>`);
    expect(body).toContain(expectedURL);

    const assetRes = await fetch(`${cdnOrigin}${expectedPath}`);
    const assetBody = await assetRes.text();

    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get("content-type")).toContain("text/css");
    expect(assetBody.trim()).toBe("body{color:red}");
  });
});
