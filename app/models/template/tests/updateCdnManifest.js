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
      content: "body { color: red; }",
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
    expect(renderedOutput).toBe("body { color: red; }");
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
      content: "body { color: pink; }",
    });

    const metadata1 = await getMetadataAsync(test.template.id);
    const oldHash = metadata1.cdn["style.css"];
    const oldRenderedKey = key.renderedOutput(oldHash);

    // Verify old rendered output exists
    const oldOutput = await getAsync(oldRenderedKey);
    expect(oldOutput).toBe("body { color: pink; }");

    // Update view content to change hash
    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body { color: purple; }",
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
    expect(newOutput).toBe("body { color: purple; }");
  });
});
