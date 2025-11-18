const { promisify } = require("util");
const setView = require("../index").setView;
const getMetadata = require("../index").getMetadata;
const createTemplate = require("../index").create;
const key = require("../key");
const client = require("models/client");
const Blog = require("models/blog");
const path = require("path");
const fs = require("fs-extra");
const config = require("config");

const getAsync = promisify(client.get).bind(client);
const getMetadataAsync = promisify(getMetadata).bind(getMetadata);
const setViewAsync = promisify(setView).bind(setView);
const blogSetAsync = promisify(Blog.set).bind(Blog);
const createTemplateAsync = promisify(createTemplate).bind(createTemplate);

// Base directory for rendered output storage (same as in updateCdnManifest.js)
const RENDERED_OUTPUT_BASE_DIR = path.join(config.data_directory, "cdn", "template");

function getRenderedOutputPath(hash, viewName) {
  const viewBaseName = path.basename(viewName);
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  const hashRemainder = hash.substring(4);
  return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hashRemainder, viewBaseName);
}

describe("updateCdnManifest", function () {
  require("./setup")({ createTemplate: true });

  // Install the template on the blog so existing tests continue to work
  // (with the new skip logic, manifests are only computed for installed templates)
  beforeEach(async function () {
    await blogSetAsync(this.blog.id, { template: this.template.id });
  });

  it("stores rendered output in Redis by hash when manifest is updated", async function () {
    const test = this;

    // Create a view that uses CDN helper - this will automatically add style.css to retrieve.cdn
    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create the style.css view that will be referenced
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body{color:red}",
    });

    // Get metadata to check manifest (setView automatically calls updateCdnManifest)
    const metadata = await getMetadataAsync(test.template.id);
    expect(metadata.cdn).toBeDefined();
    expect(metadata.cdn["style.css"]).toBeDefined();
    expect(metadata.cdn["style.css"].length).toBe(32); // MD5 hash length

    // Check Redis rendered output storage (stored by hash only)
    const hash = metadata.cdn["style.css"];
    const renderedKey = key.renderedOutput(hash);
    const renderedOutput = await getAsync(renderedKey);

    expect(renderedOutput).toBeDefined();
    expect(renderedOutput).toBe("body{color:red}");
  });

  it("removes old rendered output from Redis when hash changes", async function () {
    const test = this;

    // Create initial view that uses CDN helper
    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create the style.css view
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body{color:pink}",
    });

    const metadata1 = await getMetadataAsync(test.template.id);
    const oldHash = metadata1.cdn["style.css"];
    const oldRenderedKey = key.renderedOutput(oldHash);

    // Verify old rendered output exists
    const oldOutput = await getAsync(oldRenderedKey);
    expect(oldOutput).toBe("body{color:pink}");

    // Update view content to change hash
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body{color:purple}",
    });

    const metadata2 = await getMetadataAsync(test.template.id);
    const newHash = metadata2.cdn["style.css"];

    expect(newHash).not.toBe(oldHash);

    // Verify old rendered output is removed
    const oldOutputAfter = await getAsync(oldRenderedKey);
    expect(oldOutputAfter).toBeNull();

    // Verify new rendered output exists
    const newRenderedKey = key.renderedOutput(newHash);
    const newOutput = await getAsync(newRenderedKey);
    expect(newOutput).toBe("body{color:purple}");
  });

  it("keeps manifest entries for views with empty rendered output", async function () {
    const test = this;

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/empty.css{{/cdn}}",
    });

    await setViewAsync(test.template.id, {
      name: "empty.css",
      content: "",
    });

    const metadata = await getMetadataAsync(test.template.id);
    expect(metadata.cdn["empty.css"]).toEqual(jasmine.any(String));

    const hash = metadata.cdn["empty.css"];
    const renderedKey = key.renderedOutput(hash);
    const renderedOutput = await getAsync(renderedKey);

    expect(renderedOutput).toBe("");
  });

  it("ignores invalid CDN targets when rebuilding the manifest", async function () {
    const test = this;

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body{color:red}",
    });

    const viewKey = key.view(test.template.id, "entries.html");
    const invalidRetrieve = {
      cdn: ["style.css", "../secrets.css", "/absolute.css"],
    };

    await new Promise((resolve, reject) => {
      client.hset(viewKey, "retrieve", JSON.stringify(invalidRetrieve), (err) =>
        err ? reject(err) : resolve()
      );
    });

    await new Promise((resolve, reject) => {
      require("../util/updateCdnManifest")(test.template.id, (err) =>
        err ? reject(err) : resolve()
      );
    });

    const metadata = await getMetadataAsync(test.template.id);

    expect(metadata.cdn["style.css"]).toEqual(jasmine.any(String));
    expect(metadata.cdn["../secrets.css"]).toBeUndefined();
    expect(metadata.cdn["/absolute.css"]).toBeUndefined();
    expect(Object.keys(metadata.cdn)).toEqual(["style.css"]);
  });

  it("handles missing blog gracefully when rendering for CDN", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a template with invalid owner ID
    const invalidTemplateID = "nonexistent:template";

    // This should not throw, but should handle gracefully
    await new Promise((resolve, reject) => {
      updateCdnManifest(invalidTemplateID, (err) => {
        // Should error because template doesn't exist
        expect(err).toBeDefined();
        resolve();
      });
    });
  });

  it("handles views that reference non-existent partials", async function () {
    const test = this;

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create a view that references a non-existent partial
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "{{> nonexistent.css}} body { color: red; }",
    });

    // Should still create manifest entry (partial errors are handled)
    const metadata = await getMetadataAsync(test.template.id);
    expect(metadata.cdn["style.css"]).toEqual(jasmine.any(String));
  });

  it("handles views with circular partial dependencies", async function () {
    const test = this;

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create views with circular dependencies
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "{{> a.css}}",
    });

    await expectAsync(
      setViewAsync(test.template.id, {
        name: "a.css",
        content: "{{> style.css}}",
      })
    ).toBeRejectedWith(new Error("Your template has infinitely nested partials"));
  });

  it("rejects rendered output that exceeds maximum size", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/large.html{{/cdn}}",
    });

    // Create a view with content that exceeds 2MB
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const largeContent = "x".repeat(MAX_SIZE + 1); // Exceeds limit

    await setViewAsync(test.template.id, {
      name: "large.html",
      content: largeContent,
    });

    // Update manifest - should skip the large file
    await new Promise((resolve, reject) => {
      updateCdnManifest(test.template.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const metadata = await getMetadataAsync(test.template.id);
    // Large file should not be in manifest
    expect(metadata.cdn["large.html"]).toBeUndefined();
  });

  it("skips manifest computation for uninstalled custom template", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a new template that is NOT installed on the blog
    const templateName = test.fake.random.word();
    await createTemplateAsync(test.blog.id, templateName, {});
    
    // Get the template ID
    const getTemplateList = promisify(require("../index").getTemplateList).bind(require("../index"));
    const templates = await getTemplateList(test.blog.id);
    const uninstalledTemplate = templates.find(t => t.name === templateName);

    // Create views with CDN targets
    await setViewAsync(uninstalledTemplate.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(uninstalledTemplate.id, {
      name: "style.css",
      content: "body{color:red}",
    });

    // Call updateCdnManifest directly (should skip)
    await new Promise((resolve, reject) => {
      updateCdnManifest(uninstalledTemplate.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Verify manifest is empty
    const metadata = await getMetadataAsync(uninstalledTemplate.id);
    expect(metadata.cdn).toEqual({});

    // Verify no rendered output stored in Redis
    // (we can't easily check all possible hashes, but we know none should exist)
  });

  it("computes manifest for installed custom template", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a new template
    const templateName = test.fake.random.word();
    await createTemplateAsync(test.blog.id, templateName, {});
    
    const getTemplateList = promisify(require("../index").getTemplateList).bind(require("../index"));
    const templates = await getTemplateList(test.blog.id);
    const newTemplate = templates.find(t => t.name === templateName);

    // Install it on the blog
    await blogSetAsync(test.blog.id, { template: newTemplate.id });

    // Create views with CDN targets
    await setViewAsync(newTemplate.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(newTemplate.id, {
      name: "style.css",
      content: "body{color:blue}",
    });

    // Call updateCdnManifest (should compute)
    await new Promise((resolve, reject) => {
      updateCdnManifest(newTemplate.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Verify manifest is populated
    const metadata = await getMetadataAsync(newTemplate.id);
    expect(metadata.cdn["style.css"]).toBeDefined();
    expect(metadata.cdn["style.css"].length).toBe(32); // MD5 hash length
  });

  it("always computes manifest for SITE templates regardless of installation", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a SITE template (not installed on any blog)
    const templateName = test.fake.random.word();
    await createTemplateAsync("SITE", templateName, {});
    
    const getTemplateList = promisify(require("../index").getTemplateList).bind(require("../index"));
    const siteTemplates = await getTemplateList("SITE");
    const siteTemplate = siteTemplates.find(t => t.name === templateName);

    // Create views with CDN targets
    await setViewAsync(siteTemplate.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(siteTemplate.id, {
      name: "style.css",
      content: "body{color:green}",
    });

    // Call updateCdnManifest (should compute even though not installed)
    await new Promise((resolve, reject) => {
      updateCdnManifest(siteTemplate.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Verify manifest is populated (SITE templates should always compute)
    const metadata = await getMetadataAsync(siteTemplate.id);
    expect(metadata.cdn["style.css"]).toBeDefined();
    expect(metadata.cdn["style.css"].length).toBe(32); // MD5 hash length
  });

  it("cleans up old hashes when skipping uninstalled template", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a template and install it
    const templateName = test.fake.random.word();
    await createTemplateAsync(test.blog.id, templateName, {});
    
    const getTemplateList = promisify(require("../index").getTemplateList).bind(require("../index"));
    const templates = await getTemplateList(test.blog.id);
    const template = templates.find(t => t.name === templateName);

    // Install it
    await blogSetAsync(test.blog.id, { template: template.id });

    // Create views with CDN targets (manifest gets computed)
    await setViewAsync(template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(template.id, {
      name: "style.css",
      content: "body{color:orange}",
    });

    // Get the hash that was created
    const metadata1 = await getMetadataAsync(template.id);
    const oldHash = metadata1.cdn["style.css"];
    const oldRenderedKey = key.renderedOutput(oldHash);
    const oldFilePath = getRenderedOutputPath(oldHash, "style.css");

    // Verify old hash exists in Redis
    const oldOutputRedis = await getAsync(oldRenderedKey);
    expect(oldOutputRedis).toBe("body{color:orange}");

    // Verify old hash exists on disk
    const oldOutputDisk = await fs.pathExists(oldFilePath);
    expect(oldOutputDisk).toBe(true);

    // Uninstall template
    await blogSetAsync(test.blog.id, { template: "" });

    // Call updateCdnManifest (should skip and clean up)
    await new Promise((resolve, reject) => {
      updateCdnManifest(template.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Verify manifest is empty
    const metadata2 = await getMetadataAsync(template.id);
    expect(metadata2.cdn).toEqual({});

    // Verify old hash is cleaned up from Redis
    const oldOutputRedisAfter = await getAsync(oldRenderedKey);
    expect(oldOutputRedisAfter).toBeNull();

    // Verify old hash is cleaned up from disk
    const oldOutputDiskAfter = await fs.pathExists(oldFilePath);
    expect(oldOutputDiskAfter).toBe(false);
  });

  it("computes manifest when template becomes installed", async function () {
    const test = this;
    const updateCdnManifest = require("../util/updateCdnManifest");

    // Create a template (not installed)
    const templateName = test.fake.random.word();
    await createTemplateAsync(test.blog.id, templateName, {});
    
    const getTemplateList = promisify(require("../index").getTemplateList).bind(require("../index"));
    const templates = await getTemplateList(test.blog.id);
    const template = templates.find(t => t.name === templateName);

    // Create views with CDN targets
    await setViewAsync(template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(template.id, {
      name: "style.css",
      content: "body{color:purple}",
    });

    // Call updateCdnManifest (should skip, manifest is {})
    await new Promise((resolve, reject) => {
      updateCdnManifest(template.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const metadata1 = await getMetadataAsync(template.id);
    expect(metadata1.cdn).toEqual({});

    // Install template
    await blogSetAsync(test.blog.id, { template: template.id });

    // Call updateCdnManifest again (should compute now)
    await new Promise((resolve, reject) => {
      updateCdnManifest(template.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Verify manifest is now populated
    const metadata2 = await getMetadataAsync(template.id);
    expect(metadata2.cdn["style.css"]).toBeDefined();
    expect(metadata2.cdn["style.css"].length).toBe(32); // MD5 hash length
  });
});
