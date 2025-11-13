const { promisify } = require("util");
const setView = require("../index").setView;
const getMetadata = require("../index").getMetadata;
const key = require("../key");
const client = require("models/client");

const getAsync = promisify(client.get).bind(client);
const getMetadataAsync = promisify(getMetadata).bind(getMetadata);
const setViewAsync = promisify(setView).bind(setView);

describe("updateCdnManifest", function () {
  require("./setup")({ createTemplate: true });

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
});
