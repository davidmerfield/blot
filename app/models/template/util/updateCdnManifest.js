const { promisify } = require("util");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getPartials = require("../getPartials");
const getAllViews = require("../getAllViews");
const parseTemplate = require("helper/express-mustache/parse");
const generateCdnUrl = require("./generateCdnUrl");
const purgeCdnUrls = require("./purgeCdnUrls");

// Promisify callback-based functions
const getMetadataAsync = promisify(getMetadata);
const getAllViewsAsync = promisify(getAllViews);
const getViewAsync = promisify(getView);
const getPartialsAsync = promisify(getPartials);
const hsetAsync = promisify(client.hset).bind(client);
const setAsync = promisify(client.set).bind(client);

// Blog-specific locals that make the output unique per blog
const BLOG_SPECIFIC_LOCALS = new Set([
  // Blog properties from PUBLIC array
  'handle', 'title', 'avatar', 'domain', 'timeZone', 'plugins', 
  'permalink', 'menu', 'dateFormat', 'cacheID', 'roundAvatar', 'imageExif',
  // Special locals
  'feedURL', 'blogURL', 'cssURL', 'scriptURL',
  // Retrieved locals that depend on blog data
  'allEntries', 'recentEntries', 'allTags', 'archives', 'tagged', 'posts',
  'all_entries', 'recent_entries', 'all_tags', 'popular_tags', 
  'total_posts', 'updated', 'latestEntry', 'search_results', 'search_query',
  'absoluteURLs', 'active', 'isActive', 'avatar_url', 'feed_url',
  'folder', 'page', 'public', 'plugin_css', 'plugin_js'
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (isPlainObject(value)) {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortObject(value[key]);
      });
    return sorted;
  }

  return value;
}

// Deep merge retrieve objects, handling nested structures and special 'cdn' array case
function deepMergeRetrieve(target, source) {
  if (!isPlainObject(target)) {
    target = {};
  }
  if (!isPlainObject(source)) {
    return target;
  }

  for (const key in source) {
    // Special case: 'cdn' should be handled separately (array merging)
    if (key === 'cdn') {
      if (Array.isArray(source[key])) {
        if (!Array.isArray(target[key])) {
          target[key] = [];
        }
        // Merge arrays (union with deduplication)
        const combined = target[key].concat(source[key]);
        target[key] = [...new Set(combined)];
      }
      continue;
    }

    const targetValue = target[key];
    const sourceValue = source[key];

    // If both are objects (and not arrays), recursively merge
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      deepMergeRetrieve(targetValue, sourceValue);
    } else if (isPlainObject(sourceValue)) {
      // Source is an object, target is not (or doesn't exist) - use source
      target[key] = isPlainObject(targetValue) 
        ? deepMergeRetrieve({}, sourceValue) 
        : deepMergeRetrieve({}, sourceValue);
    } else if (sourceValue !== undefined) {
      // Source has a value (boolean, etc.) - use it if target doesn't exist or is not an object
      if (!target[key] || !isPlainObject(target[key])) {
        target[key] = sourceValue;
      }
    }
  }

  return target;
}

/**
 * Detect if view content or partials reference blog-specific variables
 */
function detectBlogSpecificReferences(viewContent, partials) {
  if (!viewContent && (!partials || Object.keys(partials).length === 0)) {
    return false;
  }

  // Parse view content
  const viewParsed = viewContent ? parseTemplate(viewContent) : { locals: [] };
  const allLocals = new Set(viewParsed.locals || []);

  // Parse all partials
  if (partials && typeof partials === 'object') {
    for (const partialName in partials) {
      const partialContent = partials[partialName];
      if (typeof partialContent === 'string') {
        const partialParsed = parseTemplate(partialContent);
        (partialParsed.locals || []).forEach(local => allLocals.add(local));
      }
    }
  }

  // Check if any referenced locals are blog-specific
  for (const local of allLocals) {
    // Handle nested properties like "menu.length" -> extract root "menu"
    const rootLocal = local.split('.')[0];
    if (BLOG_SPECIFIC_LOCALS.has(rootLocal)) {
      return true;
    }
  }

  return false;
}

function buildSignature(view, partials, templateLocals, partialLocals, partialRetrieve, blogID) {
  const viewLocals = isPlainObject(view && view.locals) ? view.locals : {};
  const metadataLocals = isPlainObject(templateLocals) ? templateLocals : {};
  const partialLocalsObj = isPlainObject(partialLocals) ? partialLocals : {};
  const partialRetrieveObj = isPlainObject(partialRetrieve) ? partialRetrieve : {};
  
  // Get all referenced locals from view.retrieve and partial retrieve objects
  // (includes both system and custom locals from main view and all nested partials)
  // Exclude 'cdn' as it's an array, not a local key
  // Only include locals that are actually referenced in the template or its partials
  const mainReferencedKeys = Object.keys(view.retrieve || {})
    .filter(k => k !== 'cdn');
  const partialReferencedKeys = Object.keys(partialRetrieveObj)
    .filter(k => k !== 'cdn');
  
  // Combine and deduplicate all referenced keys
  const referencedKeys = [...new Set([...mainReferencedKeys, ...partialReferencedKeys])].sort();

  // Build signature with only the referenced keys that have actual values
  const localsSignature = {};

  for (const key of referencedKeys) {
    // Precedence: metadata locals > view locals > partial locals
    // Only include keys that are actually available in one of these sources
    if (Object.prototype.hasOwnProperty.call(metadataLocals, key)) {
      localsSignature[key] = metadataLocals[key];
    } else if (Object.prototype.hasOwnProperty.call(viewLocals, key)) {
      localsSignature[key] = viewLocals[key];
    } else if (Object.prototype.hasOwnProperty.call(partialLocalsObj, key)) {
      localsSignature[key] = partialLocalsObj[key];
    }
    // Note: referencedKeys from retrieve that don't have values in locals
    // won't be included in the signature, which is correct - we only hash
    // locals that actually have values
  }

  const signature = {
    content: (view && view.content) || "",
    partials: {},
    locals: localsSignature,
  };

  const partialKeys = Object.keys(partials || {}).sort();
  for (const name of partialKeys) {
    signature.partials[name] = partials[name] || "";
  }

  // Include blogID in signature if provided (for blog-specific views)
  if (blogID) {
    signature.blogID = blogID;
  }

  return JSON.stringify(sortObject(signature));
}

/**
 * Recursively collect locals and retrieve objects from partial views
 */
async function collectPartialLocals(templateID, partialNames, processedPartials = new Set()) {
  const partialLocals = {};
  const partialRetrieve = {};

  if (!partialNames || Object.keys(partialNames).length === 0) {
    return { locals: partialLocals, retrieve: partialRetrieve };
  }

  for (const partialName of Object.keys(partialNames)) {
    // Skip missing
    if (!partialName) {
      continue;
    }

    // Skip entries (they start with "/") - only process template views
    if (partialName.charAt(0) === "/") {
      continue;
    }

    // Skip if already processed (avoid cycles)
    if (processedPartials.has(partialName)) {
      continue;
    }

    processedPartials.add(partialName);

    try {
      const partialView = await getViewAsync(templateID, partialName);
      
      if (!partialView) {
        continue;
      }

      // Collect locals from this partial view
      if (isPlainObject(partialView.locals)) {
        Object.keys(partialView.locals).forEach((key) => {
          // Only add if not already present (precedence: earlier partials win)
          if (!Object.prototype.hasOwnProperty.call(partialLocals, key)) {
            partialLocals[key] = partialView.locals[key];
          }
        });
      }

      // Collect retrieve from this partial view (includes referenced locals)
      // Use deep merge to handle nested structures
      if (isPlainObject(partialView.retrieve)) {
        deepMergeRetrieve(partialRetrieve, partialView.retrieve);
      }

      // Recursively collect locals and retrieve from nested partials
      const nestedPartials = isPlainObject(partialView.partials)
        ? partialView.partials
        : {};
      const nested = await collectPartialLocals(templateID, nestedPartials, processedPartials);
      
      // Merge nested locals (earlier partials take precedence)
      Object.keys(nested.locals).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(partialLocals, key)) {
          partialLocals[key] = nested.locals[key];
        }
      });

      // Merge nested retrieve using deep merge to handle nested structures
      if (isPlainObject(nested.retrieve)) {
        deepMergeRetrieve(partialRetrieve, nested.retrieve);
      }
    } catch (err) {
      // Non-fatal if partial view doesn't exist - continue processing
      continue;
    }
  }

  return { locals: partialLocals, retrieve: partialRetrieve };
}

/**
 * Process a single CDN target and build its manifest entry
 */
async function processTarget(templateID, ownerID, target, metadata) {
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

  // Ensure view.partials is always an object
  const viewPartials = isPlainObject(view.partials) ? view.partials : {};

  // Get partials content
  const partials = await getPartialsAsync(ownerID, templateID, viewPartials);

  // Collect partial view locals and retrieve objects recursively
  const { locals: partialLocals, retrieve: partialRetrieve } = await collectPartialLocals(templateID, viewPartials);

  // Detect if view references blog-specific data
  const hasBlogSpecificRefs = detectBlogSpecificReferences(view.content, partials);

  // Build signature - include ownerID if blog-specific refs detected
  // This ensures blog-specific views get unique hashes per blog
  const blogID = hasBlogSpecificRefs ? ownerID : undefined;
  const signature = buildSignature(view, partials, metadata.locals, partialLocals, partialRetrieve, blogID);
  const computedHash = hash(signature);

  return computedHash
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
      const urlsToPurge = [];

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
            
            // Store mapping - if key exists, that's fine (same output via CDN)
            await setAsync(hashKey, mapping);
          }
        } catch (err) {
          // If processing a target fails, continue with others
          // but log the error
          console.error(`Error processing CDN target ${target}:`, err);
        }
      }

      // Compare old vs new hashes and collect URLs to purge
      for (const target of sortedTargets) {
        const oldHash = oldManifest[target];
        const newHash = manifest[target];

        if (oldHash && oldHash !== newHash && typeof newHash === "string") {
          // Build old CDN URL using the old hash
          try {
            const oldUrl = generateCdnUrl(target, oldHash);
            urlsToPurge.push(oldUrl);
          } catch (err) {
            // Log error but continue - don't fail the manifest update
            console.error(`Error generating CDN URL for purge: ${target}`, err);
          }
        }
      }

      // Save manifest to Redis
      await hsetAsync(key.metadata(templateID), "cdn", JSON.stringify(manifest));

      // Purge old URLs from Bunny CDN
      if (urlsToPurge.length > 0) {
        try {
          await purgeCdnUrls(urlsToPurge);
        } catch (err) {
          // Log error but don't fail the manifest update
          console.error("Error purging CDN URLs:", err);
        }
      }
      
      callback(null, manifest);
    } catch (err) {
      callback(err);
    }
  })();
};

