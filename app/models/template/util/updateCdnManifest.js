const { promisify } = require("util");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getAllViews = require("../getAllViews");
const generateCdnUrl = require("./generateCdnUrl");
const purgeCdnUrls = require("helper/purgeCdnUrls");

// Promisify callback-based functions
const getMetadataAsync = promisify(getMetadata);
const getAllViewsAsync = promisify(getAllViews);
const getViewAsync = promisify(getView);
const hsetAsync = promisify(client.hset).bind(client);
const delAsync = promisify(client.del).bind(client);
const setAsync = promisify(client.set).bind(client);

// Maximum size for rendered output (2MB)
const MAX_RENDERED_OUTPUT_SIZE = 2 * 1024 * 1024;

/**
 * Validate target name to prevent path traversal attacks
 * @param {string} target - The target name to validate
 * @returns {boolean} - True if target is valid, false otherwise
 */
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

  // Store rendered output in Redis with 1 year TTL
  const renderedKey = key.renderedOutput(computedHash);
  try {
    await setAsync(renderedKey, renderedOutputString);
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
    const oldRenderedKey = key.renderedOutput(oldHash);
    await delAsync(oldRenderedKey);
    const oldUrl = generateCdnUrl(target, oldHash);
    await purgeCdnUrls([oldUrl]);
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
      const oldManifest =
        metadata && typeof metadata.cdn === "object" ? metadata.cdn : {};
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


