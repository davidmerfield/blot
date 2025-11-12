const config = require("config");
const { template } = require("lodash");
const { extname } = require("path");

const extractHash = (cdnURL) => {
  const parts = cdnURL.split(".");

  expect(parts.length).toBeGreaterThanOrEqual(2);

  const hash = parts[parts.length - 2];

  expect(typeof hash).toBe("string", `Wrong CDN hash type: ${cdnURL}`);
  expect(hash.length).toBe(32, `Wrong CDN hash length: ${cdnURL}`);

  return hash;
};

const validate = (cdnURL) => {
  // Check CDN origin is present
  expect(cdnURL).toContain(config.cdn.origin, `Missing CDN: ${cdnURL}`);

  // Check /view/ path is present
  expect(cdnURL).toContain(
    "/template/",
    `Missing "/template/" path: ${cdnURL}`
  );

  // Extract hash and validate structure
  const hash = extractHash(cdnURL);
  const fileName = cdnURL.split("/").pop();

  expect(fileName).toBeTruthy(`Missing CDN filename: ${cdnURL}`);

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

  expect(cdnURL).toMatch(new RegExp(hashPattern), `Wrong CDN url: ${cdnURL}`);
};

describe("cdn template function", function () {
  require("./util/setup")();

  it("renders origin", async function () {
    await this.template({
      "entries.html": `{{{cdn}}}`,
    });

    expect(await this.text("/")).toBe(config.cdn.origin);
  });

  it("works", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "entries.html": "{{#cdn}}/style.css{{/cdn}}",
    });

    validate(await this.text("/"));
  });

  it("works when you create views in the wrong order", async function () {
    await this.template({
      "entries.html": "{{#cdn}}/style.css{{/cdn}}",
      "style.css": "body { color: red; }",
    });

    validate(await this.text("/"));
  });

  it("returns the contents of the block as-is for missing views", async function () {
    await this.template({
      "entries.html": "{{#cdn}}/style.css{{/cdn}}",
    });

    expect(await this.text("/")).toBe("/style.css");
  });

  it("gracefully handles a single missing view", async function () {
    await this.template({
      "entries.html": "{{#cdn}}/missing.css{{/cdn}}|{{#cdn}}/style.css{{/cdn}}",
      "style.css": "body{color:#000}",
    });

    const [invalidURL, validURL] = (await this.text("/")).split("|");

    expect(invalidURL).toBe("/missing.css");
    validate(validURL);
  });

  it("works when you update an existing view", async function () {
    const template = {
      "style.css": "body { color: red; }",
      "entries.html": "{{{cdn}}}",
    };

    await this.template(template);

    expect(await this.text("/")).toBe(config.cdn.origin);

    await this.template({
      ...template,
      "entries.html": "{{#cdn}}/style.css{{/cdn}}",
    });

    validate(await this.text("/"));
  });

  it("works when both the string and function are used in one view", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "entries.html": "{{{cdn}}}|{{#cdn}}/style.css{{/cdn}}",
    });

    const text = await this.text("/");
    const [origin, cdnURL] = text.split("|");

    expect(origin).toBe(config.cdn.origin);
    validate(cdnURL);
  });

  it("works when both the string and multiple functions are used in one view", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "script.js": "alert('wow')",
      "entries.html":
        "{{#cdn}}/script.js{{/cdn}}|{{{cdn}}}|{{#cdn}}style.css{{/cdn}}",
    });

    const text = await this.text("/");
    const [jsCdnURL, origin, cssCdnURL] = text.split("|");

    expect(origin).toBe(config.cdn.origin);
    validate(jsCdnURL);
    validate(cssCdnURL);
  });

  it("works when the view references partials which use the string and function both", async function () {
    const template = {
      "a.css": "{{#cdn}}/c.css{{/cdn}}",
      "b.css": "{{{cdn}}}",
      "c.css": "body{color:#000}",
      "entries.html": "{{> a.css}}|{{> b.css}}",
    };

    await this.template(template);

    const text = await this.text("/");
    const [cssCdnURL, origin] = text.split("|");
    const hash = extractHash(cssCdnURL);

    expect(origin).toBe(config.cdn.origin);
    validate(cssCdnURL);

    await this.template({ ...template, "c.css": "body{color:#fff}" });

    const newHash = extractHash((await this.text("/")).split("|")[0]);

    expect(newHash).not.toBe(hash);
  });

  it("works without a leading slash", async function () {
    await this.template({
      "style.css": "body { color: red; }",
      "entries.html": "{{#cdn}}style.css{{/cdn}}",
    });

    validate(await this.text("/"));
  });

  it("updates the URL when the view changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "body { color: red; }",
    };

    await this.template(template);

    const hash = extractHash(await this.text("/"));

    await this.template({
      ...template,
      "style.css": "body { color: purple; }",
    });

    const newHash = extractHash(await this.text("/"));

    expect(hash).not.toBe(newHash);
  });

  it("preserves the URL when there is a new post", async function () {
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

  it("changes when a referenced view changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "{{> rules.css}} body { color: red; }",
      "rules.css": "a {color: pink}",
    };

    await this.template(template);

    const hash = extractHash(await this.text("/"));

    await this.template({
      ...template,
      "rules.css": "a {color: blue}",
    });

    expect(hash).not.toBe(extractHash(await this.text("/")));
    expect(await this.text("/style.css")).toBe("a{color:#00f}body{color:red}");
  });

  it("changes when a deeply nested referenced view changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "{{> a.css}}",
      "a.css": "{{> b.css}}",
      "b.css": "{{> c.css}}",
      "c.css": "body{color:#fff}",
    };

    await this.template(template);

    const hash = extractHash(await this.text("/"));

    await this.template({
      ...template,
      "c.css": "body{color:#000}",
    });

    expect(hash).not.toBe(extractHash(await this.text("/")));
    expect(await this.text("/style.css")).toBe("body{color:#000}");
  });

  it("changes when a local used in a deeply nested referenced partial changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "{{> a.css}}",
      "a.css": "{{> b.css}}",
      "b.css": "{{> c.css}}",
      "c.css": "{{wow}}",
    };

    await this.template(template, { locals: { wow: "body{color:#000}" } });

    const hash = extractHash(await this.text("/"));

    await this.template(template, { locals: { wow: "body{color:#fff}" } });

    expect(hash).not.toBe(extractHash(await this.text("/")));
    expect(await this.text("/style.css")).toBe("body{color:#fff}");
  });

  it("preserves the URL when a non-referenced view changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "body { color: red; }",
      "robots.txt": "ignore",
    };

    await this.template(template);

    const hash = extractHash(await this.text("/"));

    await this.template({
      ...template,
      "robots.txt": "allow",
    });

    expect(hash).toBe(extractHash(await this.text("/")));
  });

  it("changes when a referenced local changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "{{{variable}}}",
    };

    await this.template(template, { locals: { variable: "x{color:red}" } });
    expect(await this.text("/style.css")).toBe("x{color:red}");

    const hash = extractHash(await this.text("/"));

    await this.template(template, { locals: { variable: "x{color:#00f}" } });
    expect(await this.text("/style.css")).toBe("x{color:#00f}");
    expect(hash).not.toBe(extractHash(await this.text("/")));
  });

  it("preserves the URL when a non-referenced local changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}/style.css{{/cdn}}`,
      "style.css": "body{color:pink}",
    };

    await this.template(template, { locals: { variable: "x" } });
    expect(await this.text("/style.css")).toBe("body{color:pink}");

    const hash = extractHash(await this.text("/"));

    await this.template(template, { locals: { variable: "y" } });
    expect(await this.text("/style.css")).toBe("body{color:pink}");
    expect(hash).toBe(extractHash(await this.text("/")));
  });

  it("updates the URL when the a view-specific partial changes", async function () {
    const template = {
      "entries.html": `{{#cdn}}style.css{{/cdn}}`,
      "style.css": "{{> x}}",
    };

    const package = {
      views: {
        "style.css": {
          partials: {
            x: "body{color:#000}",
          },
        },
      },
    };

    await this.template(template, package);

    const firstCdnUrl = await this.text("/");
    const firstHash = extractHash(firstCdnUrl);

    expect(await this.text(firstCdnUrl)).toBe("body{color:#000}");

    await this.template(template, {
      views: {
        "style.css": {
          partials: {
            x: "body{color:#fff}",
          },
        },
      },
    });

    const secondCdnUrl = await this.text("/");
    const secondHash = extractHash(secondCdnUrl);

    expect(await this.text(secondCdnUrl)).toBe("body{color:#fff}");

    expect(secondHash).not.toBe(firstHash);
  });

  describe("path traversal security", function () {
    it("rejects path traversal in CDN route view names", async function () {
      await this.template({
        "style.css": "body { color: red; }",
        "entries.html": "{{#cdn}}/style.css{{/cdn}}",
      });

      // Get a valid CDN URL to extract the hash
      const cdnURL = await this.text("/");
      validate(cdnURL);

      // Extract hash from the CDN URL
      // Pattern: https://cdn.origin/template/{viewName}.{hash}.{ext}
      const hashMatch = cdnURL.match(/\.([a-f0-9]{32})\./);
      expect(hashMatch).toBeTruthy();
      const validHash = hashMatch[1];

      // Test various path traversal attempts in view names
      // The new format is /template/{viewName}.{hash}.{ext}
      // Path traversal should be rejected by parseCdnPath
      const pathTraversalAttempts = [
        "../style",
        "..%2Fstyle",
        "%2E%2E/style",
        "subdir/../../style",
        "..\\style",
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        const encodedPath = encodeURIComponent(maliciousPath);
        // Use a valid 32-char hash format, but with malicious view name
        const cdnPath = `/template/${encodedPath}.${validHash}.css`;
        const fullCdnURL = new URL(cdnPath, config.cdn.origin).toString();
        const res = await this.fetch(fullCdnURL);
        // Should reject with 400 (invalid path), 403 (forbidden), or 404 (not found)
        expect([400, 403, 404]).toContain(res.status);
      }

      // Test null byte (encoded) in view name
      const nullBytePath = "style%00";
      const nullByteCdnPath = `/template/${nullBytePath}.${validHash}.css`;
      const nullByteCdnURL = new URL(nullByteCdnPath, config.cdn.origin).toString();
      const nullByteRes = await this.fetch(nullByteCdnURL);
      expect([400, 403, 404]).toContain(nullByteRes.status);
    });

    it("rejects path traversal in template CDN targets", async function () {
      // Test that templates with path traversal in CDN targets are rejected
      const maliciousTargets = [
        "../style.css",
        "..\\style.css",
        "subdir/../../style.css",
      ];

      for (const maliciousTarget of maliciousTargets) {
        await this.template({
          "style.css": "body { color: red; }",
          "entries.html": `{{#cdn}}/${maliciousTarget}{{/cdn}}`,
        });

        // The malicious target should be ignored, so the CDN URL should not be generated
        // Instead, it should return the raw path
        const result = await this.text("/");
        expect(result).toBe(`/${maliciousTarget}`);
        expect(result).not.toContain("/template/");
      }
    });

    it("rejects CDN targets with backslashes", async function () {
      await this.template({
        "style.css": "body { color: red; }",
        "entries.html": "{{#cdn}}/subdir\\style.css{{/cdn}}",
      });

      // Backslash should be rejected
      const result = await this.text("/");
      expect(result).toBe("/subdir\\style.css");
      expect(result).not.toContain("/template/");
    });

    it("rejects CDN targets with double slashes", async function () {
      await this.template({
        "style.css": "body { color: red; }",
        "entries.html": "{{#cdn}}//style.css{{/cdn}}",
      });

      // Double slash should be rejected (existing check)
      const result = await this.text("/");
      expect(result).toBe("//style.css");
      expect(result).not.toContain("/template/");
    });

    it("rejects CDN targets with spaces", async function () {
      await this.template({
        "style.css": "body { color: red; }",
        "entries.html": "{{#cdn}}/style .css{{/cdn}}",
      });

      // Space should be rejected (existing check)
      const result = await this.text("/");
      expect(result).toBe("/style .css");
      expect(result).not.toContain("/template/");
    });
  });
});
