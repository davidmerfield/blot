const { promisify } = require("util");
const setView = require("../index").setView;
const getMetadata = require("../index").getMetadata;
const key = require("../key");
const client = require("models/client");

const smembersAsync = promisify(client.smembers).bind(client);
const getMetadataAsync = promisify(getMetadata).bind(getMetadata);
const setViewAsync = promisify(setView).bind(setView);

describe("updateCdnManifest", function () {
  require("./setup")({ createTemplate: true });

  it("creates hash mappings in Redis when manifest is updated", async function () {
    const test = this;

    // Create a view that uses CDN helper - this will automatically add style.css to retrieve.cdn
    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create the style.css view that will be referenced
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body { color: red; }",
    });

    // Get metadata to check manifest (setView automatically calls updateCdnManifest)
    const metadata = await getMetadataAsync(test.template.id);
    expect(metadata.cdn).toBeDefined();
    expect(metadata.cdn["style.css"]).toBeDefined();
    expect(metadata.cdn["style.css"].length).toBe(32); // MD5 hash length

    // Check Redis hash mapping
    const hash = metadata.cdn["style.css"];
    const hashKey = key.hashMapping(hash);
    const mappings = await smembersAsync(hashKey);

    expect(mappings.length).toBeGreaterThan(0);
    const mapping = JSON.parse(mappings[0]);
    expect(mapping.blogID).toBe(test.blog.id);
    expect(mapping.templateID).toBe(test.template.id);
    expect(mapping.viewName).toBe("style.css");
  });

  it("removes old hash mappings from Redis when hash changes", async function () {
    const test = this;

    // Create initial view that uses CDN helper
    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Create the style.css view
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body { color: pink; }",
    });

    const metadata1 = await getMetadataAsync(test.template.id);
    const oldHash = metadata1.cdn["style.css"];
    const oldHashKey = key.hashMapping(oldHash);

    // Verify old mapping exists
    const oldMappings = await smembersAsync(oldHashKey);
    expect(oldMappings.length).toBeGreaterThan(0);

    // Update view content to change hash
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body { color: purple; }",
    });

    const metadata2 = await getMetadataAsync(test.template.id);
    const newHash = metadata2.cdn["style.css"];

    expect(newHash).not.toBe(oldHash);

    // Verify old mapping is removed
    const oldMappingsAfter = await smembersAsync(oldHashKey);
    expect(oldMappingsAfter.length).toBe(0);

    // Verify new mapping exists
    const newHashKey = key.hashMapping(newHash);
    const newMappings = await smembersAsync(newHashKey);
    expect(newMappings.length).toBeGreaterThan(0);
  });
});
