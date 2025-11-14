const { promisify } = require("util");
const url = require("url");
const fetch = require("node-fetch");
const eachView = require("../each/view");
const Template = require("models/template");
const Blog = require("models/blog");
const generateCdnUrl = require("models/template/util/generateCdnUrl");
const writeToFolder = require("models/template/writeToFolder");

// Promisify callback-based functions
const setViewAsync = promisify(Template.setView);
const getMetadataAsync = promisify(Template.getMetadata);
const writeToFolderAsync = promisify(writeToFolder);

// Report structure
const report = {
  successes: [],
  mismatches: [],
  fetchErrors: [],
};

// Regex patterns to detect tokens
const CSS_URL_PATTERN = /\{\{\{?cssURL\}\}?\}/g;
const SCRIPT_URL_PATTERN = /\{\{\{?scriptURL\}\}?\}/g;

/**
 * Resolve a URL against a base URL
 * If the URL is already absolute, return it as-is
 * Otherwise, resolve it against the base URL
 */
function resolveUrl(baseUrl, targetUrl) {
  if (!targetUrl) return null;

  // If it's already a full URL (starts with http:// or https://), use it directly
  if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
    return targetUrl;
  }

  // Otherwise, resolve against base URL
  return url.resolve(baseUrl, targetUrl);
}

/**
 * Fetch an asset from a URL and return the buffer
 */
async function fetchAsset(assetUrl) {
  try {
    const response = await fetch(assetUrl, {
      timeout: 10000, // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Convert response to buffer
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    throw new Error(`Failed to fetch ${assetUrl}: ${error.message}`);
  }
}

/**
 * Process a single view to replace cssURL/scriptURL tokens with CDN helpers
 */
async function processView(user, blog, template, view) {
  if (!view || !view.content) {
    return; // Skip views without content
  }

  // Extend blog object to ensure url, cssURL, scriptURL are available
  const extendedBlog = Blog.extend(blog);
  const baseUrl = extendedBlog.url || extendedBlog.blogURL;

  if (!baseUrl) {
    report.fetchErrors.push({
      blogID: blog.id,
      templateID: template.id,
      viewName: view.name,
      error: "No base URL available for blog",
    });
    return;
  }

  // Detect tokens in view content (reset regex lastIndex before using)
  CSS_URL_PATTERN.lastIndex = 0;
  SCRIPT_URL_PATTERN.lastIndex = 0;
  const hasCssUrl = CSS_URL_PATTERN.test(view.content);
  const hasScriptUrl = SCRIPT_URL_PATTERN.test(view.content);

  if (!hasCssUrl && !hasScriptUrl) {
    return; // No tokens to replace, skip this view
  }

  // Store original content for potential revert
  const originalContent = view.content;
  let modifiedContent = originalContent;
  const replacements = [];

  // Process cssURL tokens
  if (hasCssUrl && extendedBlog.cssURL) {
    const resolvedUrl = resolveUrl(baseUrl, extendedBlog.cssURL);
    if (resolvedUrl) {
      // Reset regex before replace
      CSS_URL_PATTERN.lastIndex = 0;
      // Replace all occurrences
      modifiedContent = modifiedContent.replace(
        CSS_URL_PATTERN,
        "{{#cdn}}/style.css{{/cdn}}"
      );
      replacements.push({
        type: "css",
        originalUrl: resolvedUrl,
        viewName: "style.css",
      });
    }
  }

  // Process scriptURL tokens
  if (hasScriptUrl && extendedBlog.scriptURL) {
    const resolvedUrl = resolveUrl(baseUrl, extendedBlog.scriptURL);
    if (resolvedUrl) {
      // Reset regex before replace
      SCRIPT_URL_PATTERN.lastIndex = 0;
      // Replace all occurrences
      modifiedContent = modifiedContent.replace(
        SCRIPT_URL_PATTERN,
        "{{#cdn}}/script.js{{/cdn}}"
      );
      replacements.push({
        type: "script",
        originalUrl: resolvedUrl,
        viewName: "script.js",
      });
    }
  }

  // If no replacements were made, skip
  if (replacements.length === 0) {
    return;
  }

  // Update view content
  view.content = modifiedContent;

  try {
    // Fetch original assets before calling setView
    const originalAssets = {};
    for (const replacement of replacements) {
      try {
        originalAssets[replacement.viewName] = await fetchAsset(
          replacement.originalUrl
        );
      } catch (error) {
        // If we can't fetch the original, we can't verify, so revert and skip
        view.content = originalContent;
        report.fetchErrors.push({
          blogID: blog.id,
          templateID: template.id,
          viewName: view.name,
          error: `Failed to fetch original ${replacement.type} asset: ${error.message}`,
          originalUrl: replacement.originalUrl,
        });
        return;
      }
    }

    // Call setView to update the view and trigger CDN manifest update
    await setViewAsync(template.id, view);

    // Get updated metadata to retrieve CDN manifest
    const metadata = await getMetadataAsync(template.id);
    if (!metadata || !metadata.cdn) {
      view.content = originalContent;
      // Revert the view in the database
      await setViewAsync(template.id, {
        name: view.name,
        content: originalContent,
      });
      report.fetchErrors.push({
        blogID: blog.id,
        templateID: template.id,
        viewName: view.name,
        error: "Failed to retrieve CDN manifest after setView",
      });
      return;
    }

    // Verify each replacement
    let allMatch = true;
    const cdnUrls = {};

    for (const replacement of replacements) {
      const hash = metadata.cdn[replacement.viewName];
      if (!hash) {
        view.content = originalContent;
        // Revert the view in the database
        await setViewAsync(template.id, {
          name: view.name,
          content: originalContent,
        });
        report.fetchErrors.push({
          blogID: blog.id,
          templateID: template.id,
          viewName: view.name,
          error: `CDN manifest missing hash for ${replacement.viewName}`,
        });
        return;
      }

      // Generate CDN URL
      const cdnUrl = generateCdnUrl(replacement.viewName, hash);
      cdnUrls[replacement.viewName] = cdnUrl;

      try {
        // Fetch CDN asset
        const cdnAsset = await fetchAsset(cdnUrl);

        // Compare byte-for-byte
        const originalAsset = originalAssets[replacement.viewName];
        if (Buffer.compare(originalAsset, cdnAsset) !== 0) {
          allMatch = false;
          break;
        }
      } catch (error) {
        view.content = originalContent;
        // Revert the view in the database
        await setViewAsync(template.id, {
          name: view.name,
          content: originalContent,
        });
        report.fetchErrors.push({
          blogID: blog.id,
          templateID: template.id,
          viewName: view.name,
          error: `Failed to fetch CDN asset for ${replacement.viewName}: ${error.message}`,
          originalUrl: replacement.originalUrl,
          cdnUrl: cdnUrl,
        });
        return;
      }
    }

    // If assets don't match, revert
    if (!allMatch) {
      view.content = originalContent;
      // Revert the view in the database
      await setViewAsync(template.id, {
        name: view.name,
        content: originalContent,
      });

      report.mismatches.push({
        blogID: blog.id,
        templateID: template.id,
        viewName: view.name,
        originalUrls: replacements.map((r) => r.originalUrl),
        cdnUrls: Object.values(cdnUrls),
      });
      return;
    }

    // Success! Assets match
    // If template is locally-edited, write to folder
    if (template.localEditing) {
      try {
        await writeToFolderAsync(blog.id, template.id);
      } catch (error) {
        // Log error but don't fail the migration
        console.error(
          `Warning: Failed to write template ${template.id} to folder:`,
          error.message
        );
      }
    }

    report.successes.push({
      blogID: blog.id,
      templateID: template.id,
      viewName: view.name,
      replacements: replacements.map((r) => ({
        type: r.type,
        viewName: r.viewName,
      })),
    });
  } catch (error) {
    // Revert on any error
    view.content = originalContent;
    // Try to revert in database, but don't fail if it errors
    try {
      await setViewAsync(template.id, {
        name: view.name,
        content: originalContent,
      });
    } catch (revertError) {
      // Log but don't fail
      console.error(
        `Warning: Failed to revert view ${view.name} in database:`,
        revertError.message
      );
    }
    report.fetchErrors.push({
      blogID: blog.id,
      templateID: template.id,
      viewName: view.name,
      error: error.message,
    });
  }
}

/**
 * Main function
 */
function main(specificBlog, callback) {
  eachView(
    async function (user, blog, template, view, next) {
      if (specificBlog && specificBlog.id !== blog.id) return next();

      try {
        await processView(user, blog, template, view);
        next();
      } catch (error) {
        // Log error but continue processing
        console.error(
          `Error processing view ${view?.name} in template ${template?.id}:`,
          error
        );
        report.fetchErrors.push({
          blogID: blog?.id,
          templateID: template?.id,
          viewName: view?.name,
          error: error.message,
        });
        next();
      }
    },
    function (err) {
      if (err) {
        console.error("Error during iteration:", err);
        return callback(err);
      }

      // Log report
      console.log("\n=== Migration Report ===\n");

      console.log(`Successfully migrated: ${report.successes.length} views`);
      if (report.successes.length > 0) {
        console.log("\nSuccesses:");
        report.successes.forEach((item) => {
          console.log(
            `  - ${item.blogID} / ${item.templateID} / ${item.viewName}`
          );
          item.replacements.forEach((r) => {
            console.log(
              `    → Replaced ${r.type}URL with {{#cdn}}/${r.viewName}{{/cdn}}`
            );
          });
        });
      }

      console.log(`\nMismatches: ${report.mismatches.length} views`);
      if (report.mismatches.length > 0) {
        console.log("\nMismatches (reverted):");
        report.mismatches.forEach((item) => {
          console.log(
            `  - ${item.blogID} / ${item.templateID} / ${item.viewName}`
          );
          console.log(`    Original URLs: ${item.originalUrls.join(", ")}`);
          console.log(`    CDN URLs: ${item.cdnUrls.join(", ")}`);
        });
      }

      console.log(`\nErrors: ${report.fetchErrors.length} views`);
      if (report.fetchErrors.length > 0) {
        console.log("\nErrors:");
        report.fetchErrors.forEach((item) => {
          console.log(
            `  - ${item.blogID} / ${item.templateID} / ${item.viewName}`
          );
          console.log(`    Error: ${item.error}`);
          if (item.originalUrl)
            console.log(`    Original URL: ${item.originalUrl}`);
          if (item.cdnUrl) console.log(`    CDN URL: ${item.cdnUrl}`);
        });
      }

      console.log("\n=== End Report ===\n");

      callback(null);
    }
  );
}

// If run directly, execute main
if (require.main === module) {
  var get = require("../get/blog");

  get(process.argv[2] || "null", function (err, user, blog) {
    if (blog) {
      console.log("processing specific blog", blog.id);
    } else {
      console.log("processing all blogs");
    }
    main(blog, function (err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      console.log("processed all blogs!");
      process.exit(0);
    });
  });
}

module.exports = main;
