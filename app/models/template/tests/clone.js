describe("template", function () {
  require("./setup")();

  const getMetadata = require("../getMetadata");
  const updateCdnManifest = require("../util/updateCdnManifest");
  const { promisify } = require("util");
  const getMetadataAsync = promisify(getMetadata);
  const updateCdnManifestAsync = promisify(updateCdnManifest);
  const setView = promisify(require("../setView"));
  const create = promisify(require("../create"));

  it("generates different CDN hashes for cloned templates", async function () {
    // Create source template with a view that has CDN retrieval
    const sourceTemplateName = this.fake.random.word().toLowerCase();
    const sourceTemplate = await new Promise((resolve, reject) => {
      require("../index").create(
        this.blog.id,
        sourceTemplateName,
        {},
        function (err, template) {
          if (err) return reject(err);
          resolve(template);
        }
      );
    });

    // Add a view to be retrieved
    const viewName = "style.css";
    const viewContent = "body { color: red; }";
    await setView(sourceTemplate.id, {
      name: viewName,
      content: viewContent,
    });

    // Add a view which invokes the CDN function
    await setView(sourceTemplate.id, {
      name: "head.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Update CDN manifest for source template
    await updateCdnManifestAsync(sourceTemplate.id);

    // Get source template metadata with CDN manifest
    const sourceMetadata = await getMetadataAsync(sourceTemplate.id);
    expect(sourceMetadata.cdn).toBeDefined();
    expect(sourceMetadata.cdn[viewName]).toBeDefined();
    const sourceHash = sourceMetadata.cdn[viewName];
    expect(typeof sourceHash).toBe("string");
    expect(sourceHash.length).toBe(32);

    // Clone the template
    const clonedTemplateName = this.fake.random.word().toLowerCase();
    const clonedTemplate = await create(this.blog.id, clonedTemplateName, {
      cloneFrom: sourceTemplate.id,
    });

    // Verify cloned template has different ID
    expect(clonedTemplate.id).not.toBe(sourceTemplate.id);
    expect(clonedTemplate.id).toContain(clonedTemplateName);

    // Get cloned template metadata with CDN manifest
    const clonedMetadata = await getMetadataAsync(clonedTemplate.id);
    expect(clonedMetadata.cdn).toBeDefined();
    expect(clonedMetadata.cdn[viewName]).toBeDefined();
    const clonedHash = clonedMetadata.cdn[viewName];
    expect(typeof clonedHash).toBe("string");
    expect(clonedHash.length).toBe(32);

    // Verify hashes are different (because template IDs are different)
    expect(clonedHash).not.toBe(sourceHash);
  });

  it("cloned template CDN manifest is independent from source", async function () {
    // Create source template
    const sourceTemplateName = this.fake.random.word();
    const sourceTemplate = await create(this.blog.id, sourceTemplateName, {});

    // Add a view to be retrieved
    const viewName = "style.css";
    const viewContent = "body { color: red; }";
    await setView(sourceTemplate.id, {
      name: viewName,
      content: viewContent,
    });

    // Add a view which invokes the CDN function
    await setView(sourceTemplate.id, {
      name: "head.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    // Update CDN manifest for source template
    await updateCdnManifestAsync(sourceTemplate.id);
    const sourceMetadataBefore = await getMetadataAsync(sourceTemplate.id);
    const sourceHashBefore = sourceMetadataBefore.cdn[viewName];

    // Clone the template
    const clonedTemplateName = this.fake.random.word();
    const clonedTemplate = await create(this.blog.id, clonedTemplateName, {
      cloneFrom: sourceTemplate.id,
    });

    // Get cloned template hash
    const clonedMetadata = await getMetadataAsync(clonedTemplate.id);
    const clonedHash = clonedMetadata.cdn[viewName];

    // Modify source template content
    const updatedContent = "body { color: blue; }";
    await setView(sourceTemplate.id, {
      name: viewName,
      content: updatedContent,
    });
    
    // Update CDN manifest for source template (should change hash)
    await updateCdnManifestAsync(sourceTemplate.id);
    const sourceMetadataAfter = await getMetadataAsync(sourceTemplate.id);
    const sourceHashAfter = sourceMetadataAfter.cdn[viewName];

    // Verify source template hash changed
    expect(sourceHashAfter).not.toBe(sourceHashBefore);

    // Verify cloned template hash remains unchanged (independent)
    const clonedMetadataAfter = await getMetadataAsync(clonedTemplate.id);
    const clonedHashAfter = clonedMetadataAfter.cdn[viewName];
    expect(clonedHashAfter).toBe(clonedHash);
  });
});
