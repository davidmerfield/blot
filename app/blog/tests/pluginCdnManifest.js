const config = require("config");

const extractHash = (cdnURL) => {
  // New format: /template/{hash[0:2]}/{hash[2:4]}/{hash[4:]}/{viewName}
  // Example: /template/f0/60/a480fb013c56e90af7f0ac1e961c/style.css
  const templateMatch = cdnURL.match(/\/template\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]+)\//);
  
  expect(templateMatch).toBeTruthy(`Invalid CDN URL format: ${cdnURL}`);
  
  const dir1 = templateMatch[1];
  const dir2 = templateMatch[2];
  const hashRemainder = templateMatch[3];
  
  // Reconstruct full hash: first 4 chars from dirs + remainder
  const hash = dir1 + dir2 + hashRemainder;
  
  expect(typeof hash).toBe("string", `Wrong CDN hash type: ${cdnURL}`);
  expect(hash.length).toBe(32, `Wrong CDN hash length: ${cdnURL} (got ${hash.length})`);

  return hash;
};

describe("plugin CDN manifest updates", function () {
  require("./util/setup")();

  it("updates CDN manifest hash for script.js when analytics plugin changes", async function () {
    
    // Create a template with script.js that uses appJS (which includes analytics)
    // and make script.js a CDN target by referencing it in another view
    await this.template({
      "script.js": "{{{appJS}}}",
      "entries.html": "{{#cdn}}/script.js{{/cdn}}",
    });

    // Get the initial CDN URL for script.js from the rendered HTML
    const initialHtml = await this.text("/");
    const initialCdnUrlMatch = initialHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(initialCdnUrlMatch).toBeTruthy();
    const initialCdnUrl = initialCdnUrlMatch[0];
    
    expect(initialCdnUrl).toContain("/script.js");
    const initialHash = extractHash(initialCdnUrl);

    // Verify initial state has no analytics
    const initialScriptContent = await this.text(initialCdnUrl);
    expect(initialScriptContent).not.toContain("www.google-analytics.com");

    // Update analytics plugin - this should trigger CDN manifest update
    const plugins = {
      ...this.blog.plugins,
      analytics: {
        enabled: true,
        options: {
          provider: { Google: true },
          trackingID: "UA-12345678-9",
        },
      },
    };
    await this.blog.update({ plugins });

    // Wait for the CDN manifest update to complete and propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get the new CDN URL for script.js
    const updatedHtml = await this.text("/");
    const updatedCdnUrlMatch = updatedHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(updatedCdnUrlMatch).toBeTruthy();
    const updatedCdnUrl = updatedCdnUrlMatch[0];
    
    expect(updatedCdnUrl).toContain("/script.js");
    const updatedHash = extractHash(updatedCdnUrl);

    // The hash should have changed because the rendered output of script.js
    // now includes analytics code, which changes the hash
    expect(updatedHash).not.toBe(initialHash);

    // Verify the CDN URL actually serves the updated content with analytics
    const scriptContent = await this.text(updatedCdnUrl);
    expect(scriptContent).toContain("www.google-analytics.com/analytics.js");
    expect(scriptContent).toContain("UA-12345678-9");
  });

  it("updates CDN manifest hash when analytics plugin is disabled", async function () {
    // Start with analytics enabled
    const pluginsWithAnalytics = {
      ...this.blog.plugins,
      analytics: {
        enabled: true,
        options: {
          provider: { Google: true },
          trackingID: "UA-12345678-9",
        },
      },
    };
    await this.blog.update({ plugins: pluginsWithAnalytics });

    await this.template({
      "script.js": "{{{appJS}}}",
      "entries.html": "{{#cdn}}/script.js{{/cdn}}",
    });

    // Wait for initial manifest update
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const initialHtml = await this.text("/");
    const initialCdnUrlMatch = initialHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(initialCdnUrlMatch).toBeTruthy();
    const initialCdnUrl = initialCdnUrlMatch[0];
    const initialHash = extractHash(initialCdnUrl);

    // Verify analytics is present
    const initialScriptContent = await this.text(initialCdnUrl);
    expect(initialScriptContent).toContain("www.google-analytics.com");

    // Disable analytics plugin
    const pluginsWithoutAnalytics = {
      ...this.blog.plugins,
      analytics: {
        enabled: false,
      },
    };
    await this.blog.update({ plugins: pluginsWithoutAnalytics });

    // Wait for CDN manifest update to complete and propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const updatedHtml = await this.text("/");
    const updatedCdnUrlMatch = updatedHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(updatedCdnUrlMatch).toBeTruthy();
    const updatedCdnUrl = updatedCdnUrlMatch[0];
    const updatedHash = extractHash(updatedCdnUrl);

    // The hash should have changed because analytics is no longer in the output
    expect(updatedHash).not.toBe(initialHash);

    // Verify analytics is no longer present
    const updatedScriptContent = await this.text(updatedCdnUrl);
    expect(updatedScriptContent).not.toContain("www.google-analytics.com");
  });

  it("updates CDN manifest hash when analytics provider changes", async function () {
    await this.template({
      "script.js": "{{{appJS}}}",
      "entries.html": "{{#cdn}}/script.js{{/cdn}}",
    });

    // Start with Google Analytics
    const pluginsGoogle = {
      ...this.blog.plugins,
      analytics: {
        enabled: true,
        options: {
          provider: { Google: true },
          trackingID: "UA-12345678-9",
        },
      },
    };
    await this.blog.update({ plugins: pluginsGoogle });

    // Wait for initial manifest update
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const initialHtml = await this.text("/");
    const initialCdnUrlMatch = initialHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(initialCdnUrlMatch).toBeTruthy();
    const initialCdnUrl = initialCdnUrlMatch[0];
    const initialHash = extractHash(initialCdnUrl);

    // Switch to Plausible Analytics
    const pluginsPlausible = {
      ...this.blog.plugins,
      analytics: {
        enabled: true,
        options: {
          provider: { Plausible: true },
        },
      },
    };
    await this.blog.update({ plugins: pluginsPlausible });

    // Wait for CDN manifest update to complete and propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const updatedHtml = await this.text("/");
    const updatedCdnUrlMatch = updatedHtml.match(
      new RegExp(`${config.cdn.origin}/template/[^"']+`)
    );
    expect(updatedCdnUrlMatch).toBeTruthy();
    const updatedCdnUrl = updatedCdnUrlMatch[0];
    const updatedHash = extractHash(updatedCdnUrl);

    // The hash should have changed because the analytics code changed
    expect(updatedHash).not.toBe(initialHash);

    // Verify the new provider is present
    const updatedScriptContent = await this.text(updatedCdnUrl);
    expect(updatedScriptContent).toContain("plausible.io/js/plausible.js");
    expect(updatedScriptContent).not.toContain("www.google-analytics.com");
  });
});
