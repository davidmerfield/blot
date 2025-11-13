const { promisify } = require("util");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getAllViews = require("../getAllViews");
const generateCdnUrl = require("./generateCdnUrl");
const purgeCdnUrls = require("./purgeCdnUrls");

// Promisify callback-based functions
const getMetadataAsync = promisify(getMetadata);
const getAllViewsAsync = promisify(getAllViews);
const getViewAsync = promisify(getView);
const hsetAsync = promisify(client.hset).bind(client);
const saddAsync = promisify(client.sadd).bind(client);
const sremAsync = promisify(client.srem).bind(client);
const scardAsync = promisify(client.scard).bind(client);
const smembersAsync = promisify(client.smembers).bind(client);
const delAsync = promisify(client.del).bind(client);
const setexAsync = promisify(client.setex).bind(client);

/**
 * Process a single CDN target and build its manifest entry
 */
async function processTarget(templateID, ownerID, target, metadata) {
  // Lazy require inside function to avoid circular dependency
  async function renderViewForCdn(templateID, blogID, viewName, metadata) {
    // Lazy require to avoid circular dependency
    const Blog = require("../../../models/blog");
    const blogDefaults = require("../../../models/blog/defaults");
    const renderMiddleware = require("../../../blog/render/middleware");
    const { promisify } = require("util");
    const getBlogAsync = promisify(Blog.get);

    try {
      // Fetch or create blog object
      let blogData;
      if (blogID === "SITE") {
        // For SITE templates, use defaults
        blogData = {};
      } else {
        // For blog templates, fetch the actual blog
        blogData = await getBlogAsync({ id: blogID });
        if (!blogData) {
          // Missing blog - skip in manifest
          return null;
        }
      }

      // Extend blog with defaults and extend function
      const blog = Blog.extend(Object.assign({}, blogDefaults, blogData));

      // Create mock req/res objects compatible with render middleware
      let renderedOutput = null;
      let renderError = null;

      const req = {
        blog: blog,
        preview: false,
        log: () => {}, // no-op logger
        template: {
          locals: metadata.locals || {},
          id: templateID,
          cdn: {}, // empty for CDN target rendering
        },
        query: {},
        protocol: "https",
        headers: {},
      };

      const res = {
        locals: { partials: {} },
        header: () => {},
        set: () => {},
        send: (output) => {
          // Capture output if callback not used
          renderedOutput = output;
        },
        renderView: null, // Set by render middleware
      };

      // Call render middleware
      await new Promise((resolve) => {
        renderMiddleware(req, res, (err) => {
          if (err) {
            renderError = err;
            return resolve();
          }
          resolve();
        });
      });

      if (renderError) {
        // Log error but don't fail entire manifest update
        console.error(`Error rendering view ${viewName} for CDN:`, renderError);
        return null;
      }

      // Render the view using res.renderView with callback to capture output
      let resolved = false;
      await new Promise((resolve) => {
        res.renderView(viewName, (err) => {
          // next callback - called on errors or if no callback provided
          if (resolved) return; // Already resolved by callback
          if (err) {
            // Handle missing view or render errors
            if (err.code === "NO_VIEW") {
              // Missing view - skip in manifest (not an error)
              renderError = null;
            } else {
              renderError = err;
              console.error(`Error rendering view ${viewName} for CDN:`, err);
            }
          }
          // If we get here without error and no callback was used, output should be in res.send
          resolved = true;
          resolve();
        }, (err, output) => {
          // Callback pattern - captures output directly when successful
          if (resolved) return; // Already resolved by next
          if (err) {
            renderError = err;
            console.error(`Error rendering view ${viewName} for CDN:`, err);
          } else if (output) {
            renderedOutput = output;
          }
          resolved = true;
          resolve();
        });
      });

      if (renderError || !renderedOutput) {
        return null;
      }

      return renderedOutput;
    } catch (err) {
      // Log error but don't fail entire manifest update
      console.error(`Error in renderViewForCdn for ${viewName}:`, err);
      return null;
    }
  }

  // Check if view exists
  let view;
  try {
    view = await getViewAsync(templateID, target);
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
  const renderedOutput = await renderViewForCdn(templateID, ownerID, target, metadata);
  
  if (!renderedOutput) {
    // Missing view or render error - skip in manifest
    return null;
  }

  // Compute hash from templateID + rendered output (ensures uniqueness per template)
  const hashInput = templateID + ":" + renderedOutput;
  const computedHash = hash(hashInput);

  // Store rendered output in Redis with 1 year TTL (31536000 seconds)
  const renderedKey = key.renderedOutput(templateID, computedHash);
  try {
    await setexAsync(renderedKey, 31536000, renderedOutput);
  } catch (err) {
    // Log error but continue - don't fail manifest update
    console.error(`Error storing rendered output for ${target}:`, err);
  }

  return computedHash;
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
        return callback(null);
      }

      if (!metadata.owner) {
        return callback(new Error("Template metadata missing owner"));
      }

      const ownerID = metadata.owner;

      // Get all views and collect CDN targets from their retrieve.cdn arrays
      const views = await getAllViewsAsync(templateID);

      // Collect all unique CDN targets from all views
      const allTargets = new Set();
      for (const viewName in views) {
        const view = views[viewName];
        if (view && view.retrieve && Array.isArray(view.retrieve.cdn)) {
          view.retrieve.cdn.forEach((target) => {
            if (typeof target === "string" && target.trim()) {
              allTargets.add(target);
            }
          });
        }
      }

      const sortedTargets = Array.from(allTargets).sort();
      const manifest = {};
      const oldManifest = metadata.cdn || {};

      // Track old mappings for cleanup: hash -> Set of mappings to remove
      const oldHashesToCleanup = new Map();
      for (const target in oldManifest) {
        const oldHash = oldManifest[target];
        if (oldHash && typeof oldHash === 'string') {
          if (!oldHashesToCleanup.has(oldHash)) {
            oldHashesToCleanup.set(oldHash, new Set());
          }
          oldHashesToCleanup.get(oldHash).add(JSON.stringify({
            blogID: ownerID,
            templateID: templateID,
            viewName: target
          }));
        }
      }

      // Process each target sequentially
      for (const target of sortedTargets) {
        try {
          const result = await processTarget(templateID, ownerID, target, metadata);
          if (result && typeof result === 'string') {
            // Store full 32-char MD5 hash as string
            // For blog-specific views, hash includes ownerID; for shared views, hash is same across blogs
            manifest[target] = result;
            
            // Store hash mapping in Redis for CDN route lookup
            // For blog-specific hashes, this maps to ownerID; for shared hashes, any blog can use it
            const hashKey = key.hashMapping(result);
            const mapping = JSON.stringify({
              blogID: ownerID,
              templateID: templateID,
              viewName: target
            });
            
            // Add new mapping to set using SADD
            await saddAsync(hashKey, mapping);
            
            // If hash changed, remove old mapping from the set and delete old rendered output
            const oldHash = oldManifest[target];
            if (oldHash && oldHash !== result && typeof oldHash === 'string') {
              const oldHashKey = key.hashMapping(oldHash);
              const oldMapping = JSON.stringify({
                blogID: ownerID,
                templateID: templateID,
                viewName: target
              });
              
              // Delete old rendered output
              const oldRenderedKey = key.renderedOutput(templateID, oldHash);
              try {
                await delAsync(oldRenderedKey);
              } catch (err) {
                // Log error but continue - don't fail the manifest update
                console.error(`Error deleting old rendered output for ${target}:`, err);
              }
              
              // Remove old mapping from set
              await sremAsync(oldHashKey, oldMapping);
              
              // Check if set is now empty after removal
              const remainingCount = await scardAsync(oldHashKey);
              if (remainingCount === 0) {
                // Set is empty - purge CDN URL and delete Redis key
                try {
                  const oldUrl = generateCdnUrl(target, oldHash);
                  await purgeCdnUrls([oldUrl]);
                  await delAsync(oldHashKey);
                } catch (err) {
                  // Log error but continue - don't fail the manifest update
                  console.error(`Error purging CDN URL for empty set: ${target}`, err);
                }
              }
              
              // Remove from oldHashesToCleanup since we've handled it
              if (oldHashesToCleanup.has(oldHash)) {
                oldHashesToCleanup.get(oldHash).delete(oldMapping);
                if (oldHashesToCleanup.get(oldHash).size === 0) {
                  oldHashesToCleanup.delete(oldHash);
                }
              }
            } else if (oldHash === result) {
              // Hash didn't change - remove from oldHashesToCleanup since it's still in use
              if (oldHashesToCleanup.has(oldHash)) {
                const mappingToRemove = JSON.stringify({
                  blogID: ownerID,
                  templateID: templateID,
                  viewName: target
                });
                oldHashesToCleanup.get(oldHash).delete(mappingToRemove);
                if (oldHashesToCleanup.get(oldHash).size === 0) {
                  oldHashesToCleanup.delete(oldHash);
                }
              }
            }
          }
        } catch (err) {
          // If processing a target fails, continue with others
          // but log the error
          console.error(`Error processing CDN target ${target}:`, err);
        }
      }

      // Clean up mappings for targets that were removed entirely from manifest
      // (targets in oldManifest but not in new manifest)
      for (const [oldHash, mappingsToRemove] of oldHashesToCleanup) {
        for (const mappingStr of mappingsToRemove) {
          try {
            const mapping = JSON.parse(mappingStr);
            // Only process if this mapping is for this template
            if (mapping.templateID === templateID) {
              const oldHashKey = key.hashMapping(oldHash);
              
              // Delete old rendered output if no other mappings exist for this template
              // Check if there are other mappings for this template with the same hash
              const allMappings = await smembersAsync(oldHashKey);
              const otherMappingsForTemplate = allMappings.filter(m => {
                try {
                  const parsed = JSON.parse(m);
                  return parsed.templateID === templateID && m !== mappingStr;
                } catch {
                  return false;
                }
              });
              
              // If no other mappings for this template, delete rendered output
              if (otherMappingsForTemplate.length === 0) {
                const oldRenderedKey = key.renderedOutput(templateID, oldHash);
                try {
                  await delAsync(oldRenderedKey);
                } catch (err) {
                  // Log error but continue - don't fail the manifest update
                  console.error(`Error deleting rendered output for removed target: ${mapping.viewName}`, err);
                }
              }
              
              // Remove mapping from set
              await sremAsync(oldHashKey, mappingStr);
              
              // Check if set is now empty after removal
              const remainingCount = await scardAsync(oldHashKey);
              if (remainingCount === 0) {
                // Set is empty - purge CDN URL and delete Redis key
                try {
                  const oldUrl = generateCdnUrl(mapping.viewName, oldHash);
                  await purgeCdnUrls([oldUrl]);
                  await delAsync(oldHashKey);
                } catch (err) {
                  // Log error but continue - don't fail the manifest update
                  console.error(`Error purging CDN URL for removed target: ${mapping.viewName}`, err);
                }
              }
            }
          } catch (err) {
            // Log error but continue - non-fatal
            console.error(`Error processing removed target mapping:`, err);
          }
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


