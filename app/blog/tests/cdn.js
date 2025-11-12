const config = require("config");
const view = require("../view");
const cdn = require("../render/retrieve/cdn");
const { extname } = require("path");

describe("cdn manifest integration", function () {
  require("./util/setup")();

  const extractHash = (cdnURL) => {
    const parts = cdnURL.split(".");
    const hash = parts[parts.length - 2];

    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(7);

    return hash;
  };

  const validate = (cdnURL) => {
    console.log("validating", cdnURL);
    // Check CDN origin is present
    expect(cdnURL).toContain(config.cdn.origin);

    // Check /view/ path is present
    expect(cdnURL).toContain("/view/");

    // Fall back
    const hash = extractHash(cdnURL);
    const fileName = cdnURL.split("/").pop();
    const extension = extname(fileName);
    const fileNameWithoutHashAndExtension = fileName
      .split(extension)
      .join("")
      .split("." + hash)
      .join("");

    // Build regex pattern for hash and extension
    // Pattern: /view/template-id/view-name.hash.ext
    // The view name might be URL encoded, so we check for it flexibly
    let hashPattern = `/${fileNameWithoutHashAndExtension}\\.${hash}${extension}$`;

    expect(cdnURL).toMatch(new RegExp(hashPattern));
  };

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

    validate(await this.text("/"));
  });

  it("renders CDN URLs for views without a leading slash", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "entries.html": "{{#cdn}}style.css{{/cdn}}",
    });

    validate(await this.text("/"));
  });

  it("updates the CDN URL when the view changes", async function () {
    await this.template({
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "body { color: red; }",
    });

    const cdnURL = await this.text("/");
    const hash = extractHash(cdnURL);

    await this.template({
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "body { color: purple; }",
    });

    const newCdnURL = await this.text("/");
    const newHash = extractHash(newCdnURL);

    expect(cdnURL).not.toBe(newCdnURL);
    expect(hash).not.toBe(newHash);
  });

  it("does not change the CDN URL when the blog changes", async function () {
    await this.template({
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "body { color: red; }",
    });

    const cdnURL = await this.text("/");
    validate(cdnURL);

    await this.write({ path: "/Hello.txt", content: "Hello" });

    const newCdnURL = await this.text("/");
    validate(newCdnURL);

    expect(cdnURL).toBe(newCdnURL);
  });
});
