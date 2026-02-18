const { promisify } = require("util");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getAllViews = require("../getAllViews");
const generateCdnUrl = require("./generateCdnUrl");
const { minifyCSS, minifyJS } = require("helper/minify");
const purgeCdnUrls = require("helper/purgeCdnUrls");
const path = require("path");
const fs = require("fs-extra");
const config = require("config");

// Promisify callback-based functions
const getMetadataAsync = promisify(getMetadata);
const getAllViewsAsync = promisify(getAllViews);
const getViewAsync = promisify(getView);
const hsetAsync = promisify(client.hset).bind(client);
const delAsync = promisify(client.del).bind(client);
const setAsync = promisify(client.set).bind(client);

// Maximum size for rendered output (2MB)
const MAX_RENDERED_OUTPUT_SIZE = 2 * 1024 * 1024;

// Base directory for rendered output storage
const RENDERED_OUTPUT_BASE_DIR = path.join(config.data_directory, "cdn", "template");


function getRenderedOutputPath(hash, viewName) {
  if (!hash || typeof hash !== "string" || hash.length < 4) {
    throw new Error("Invalid hash: must be a string with at least 4 characters");
  }
  if (!viewName || typeof viewName !== "string") {
    throw new Error("viewName must be a non-empty string");
  }
  // Use basename only for file storage (e.g., "header.html" from "partials/header.html")
  // The full path is preserved in the URL via generateCdnUrl
  const viewBaseName = path.basename(viewName);
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  const hashRemainder = hash.substring(4);
  return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hashRemainder, viewBaseName);
}

async function writeRenderedOutputToDisk(hash, content, viewName) {
  const filePath = getRenderedOutputPath(hash, viewName);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

async function deleteRenderedOutputFromDisk(hash, viewName) {
  const filePath = getRenderedOutputPath(hash, viewName);
  await fs.remove(filePath).catch((err) => {
    // Ignore ENOENT errors (file doesn't exist)
    if (err.code !== "ENOENT") throw err;
  });
}

function isValidTarget(target) {
  if (!target || typeof target !== "string") {
    return false;
  }

  // Reject paths containing ".." (path traversal)
  if (target.includes("..")) {
    return false;
  }

  // Reject paths containing null bytes
  if (target.includes("\0")) {
    return false;
  }

  // Reject absolute paths (starting with "/")
  if (target.startsWith("/")) {
    return false;
  }

  return true;
}

/**
 * Process a single CDN target and build its manifest entry
 */
async function processTarget(
  templateID,
  target
) {

  // require here becuse of dependency loop
  const renderView = require("blog/render/view");

  // Check if view exists
  try {
    const view = await getViewAsync(templateID, target);
    if (!view) {
      return null;
    }
  } catch (err) {
    // Treat ENOENT errors and "No view:" errors as non-fatal
    const isNonFatalError =
      err.code === "ENOENT" ||
      (err.message && err.message.includes("No view:"));
    
    if (isNonFatalError) {
      return null;
    }
    
    throw err;
  }

  // Render the view to get output
  const renderedOutput = await renderView(templateID, target);
  
  if (renderedOutput === undefined || renderedOutput === null) {
    return null; // Missing view or render error - skip in manifest
  }

  const renderedOutputString =
    typeof renderedOutput === "string" ? renderedOutput : String(renderedOutput);

  // Validate rendered output size
  if (renderedOutputString.length > MAX_RENDERED_OUTPUT_SIZE) {
    console.error(
      `Rendered output for ${target} exceeds maximum size (${renderedOutputString.length} bytes > ${MAX_RENDERED_OUTPUT_SIZE} bytes)`
    );
    return null;
  }

  // Compute hash from templateID + view name + rendered output
  // We include the template ID and view name to ensure that hashes are unique per site
  // and per view because we purge the old hash when this changes.
  const hashInput = templateID + ":" + target + ":" + renderedOutputString;
  const computedHash = hash(hashInput);

  const ext = path.extname(target).toLowerCase();
  let contentToWrite = renderedOutputString;

  try {
    if (ext === ".css") {
      contentToWrite = minifyCSS(renderedOutputString);
    } else if (ext === ".js") {
      contentToWrite = await minifyJS(renderedOutputString);
    }
  } catch (err) {
    console.error(`Error minifying rendered output for ${target}:`, err);
    contentToWrite = renderedOutputString;
  }

  // Store rendered output on disk and in Redis (for backward compatibility during migration)
  const renderedKey = key.renderedOutput(computedHash);
  try {
    // Write to disk (primary storage) with original view name
    await writeRenderedOutputToDisk(computedHash, contentToWrite, target);

    // Also write to Redis for backward compatibility during migration period
    await setAsync(renderedKey, contentToWrite);
  } catch (err) {
    console.error(`Error storing rendered output for ${target}:`, err);
    return null; // Don't create manifest entry if storage fails
  }

  return computedHash;
}

/**
 * Clean up old rendered output and purge CDN URL
 */
async function cleanupOldHash(target, oldHash) {
  if (!oldHash || typeof oldHash !== 'string') return;
  
  try {
    // Delete from disk using original view name
    await deleteRenderedOutputFromDisk(oldHash, target);
    
    // Delete from Redis
    const oldRenderedKey = key.renderedOutput(oldHash);
    await delAsync(oldRenderedKey);
    
    // Background purge CDN URL from Bunny in background (not important)
    // if it fails, worst case we pay to store a stale file. the url used
    // on the site changes over to the new version so no worries.
    const oldUrl = generateCdnUrl(target, oldHash);
    purgeCdnUrls([oldUrl]);
  } catch (err) {
    console.error(`Error cleaning up old hash for ${target}:`, err);
  }
}

module.exports = function updateCdnManifest(templateID, callback) {
  callback = callback || function () {};

  (async () => {
    try {
      ensure(templateID, "string");
    } catch (err) {
      return callback(err);
    }

    try {
      const metadata = await getMetadataAsync(templateID);

      if (!metadata) {
        return callback(new Error("Template metadata not found"));
      }

      if (!metadata.owner) {
        return callback(new Error("Template metadata missing owner"));
      }

      // Immediately exit without changes if the template is owned by SITE
      if (metadata.owner === "SITE") {
        return callback(null, metadata.cdn || {});
      }

      const oldManifest =
        metadata && typeof metadata.cdn === "object" ? metadata.cdn : {};

      // Skip CDN manifest computation when the template is not installed on the owner blog.
      //
      // Safety: Templates are siloed per blog and preview subdomains do not use CDN manifests
      // for non-SITE templates (see app/blog/render/retrieve/cdn.js lines 12-15). There is no
      // other way to view a template that isn't installed on a blog, so the manifest would go
      // unused.
      // Require Blog.get here to avoid dependency loops
      const Blog = require("models/blog");
      const getBlogAsync = promisify(Blog.get);

      const blog = await getBlogAsync({ id: metadata.owner });
      const templateInstalled = blog && blog.template === templateID;

      if (!templateInstalled) {
        metadata.cdn = {};
        await hsetAsync(key.metadata(templateID), "cdn", JSON.stringify({}));

        for (const target in oldManifest) {
          await cleanupOldHash(target, oldManifest[target]);
        }

        return callback(null, {});
      }

      // Get all views and collect CDN targets from their retrieve.cdn arrays
      const views = await getAllViewsAsync(templateID);
      const allTargets = new Set();
      
      for (const viewName in views) {
        const view = views[viewName];
        if (view?.retrieve?.cdn && Array.isArray(view.retrieve.cdn)) {
          view.retrieve.cdn.forEach((target) => {
            if (typeof target === "string" && target.trim() && isValidTarget(target.trim())) {
              allTargets.add(target.trim());
            }
          });
        }
      }

      const sortedTargets = Array.from(allTargets).sort();
      const manifest = {};
      const inProgressManifest = Object.assign({}, oldManifest);
      metadata.cdn = inProgressManifest;

      // Process each target sequentially
      for (const target of sortedTargets) {
        try {
          let manifestChanged = false;
          const result = await processTarget(
            templateID,
            target
          );
          if (result && typeof result === 'string') {
            manifest[target] = result;
            const previousHash = inProgressManifest[target];
            inProgressManifest[target] = result;
            if (previousHash !== result) {
              manifestChanged = true;
            }

            // Clean up old hash if it changed
            const oldHash = oldManifest[target];
            if (oldHash && oldHash !== result && typeof oldHash === 'string') {
              // Run cleanup in background - don't await
              cleanupOldHash(target, oldHash).catch(err => {
                // Error already logged in cleanupOldHash, but catch to prevent unhandled rejection
              });
            }
          } else {
            if (Object.prototype.hasOwnProperty.call(inProgressManifest, target)) {
              delete inProgressManifest[target];
              manifestChanged = true;
            }
          }

          if (manifestChanged) {
            await hsetAsync(
              key.metadata(templateID),
              "cdn",
              JSON.stringify(inProgressManifest)
            );
          }
        } catch (err) {
          console.error(`Error processing CDN target ${target}:`, err);
        }
      }

      // Clean up rendered outputs for targets that were removed entirely
      for (const target in oldManifest) {
        if (!manifest.hasOwnProperty(target)) {
          // Run cleanup in background - don't await
          cleanupOldHash(target, oldManifest[target]).catch(err => {
            // Error already logged in cleanupOldHash, but catch to prevent unhandled rejection
          });
        }
      }

      // Save manifest to Redis
      await hsetAsync(key.metadata(templateID), "cdn", JSON.stringify(manifest));
      
      callback(null, manifest);
    } catch (err) {
      callback(err);
    }
  })();
};


