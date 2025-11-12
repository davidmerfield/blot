const { promisify } = require("util");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getPartials = require("../getPartials");
const getAllViews = require("../getAllViews");
const mustache = require("mustache");

// Promisify callback-based functions
const getMetadataAsync = promisify(getMetadata);
const getAllViewsAsync = promisify(getAllViews);
const getViewAsync = promisify(getView);
const getPartialsAsync = promisify(getPartials);
const hsetAsync = promisify(client.hset).bind(client);

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

function collectTemplateLocalKeys(viewContent, partials, availableKeys) {
  const knownKeys = new Set(availableKeys || []);
  const dependencies = new Set();

  function register(name) {
    if (!name || name === ".") return;

    const parts = name.split(".");
    const root = parts[0];

    if (knownKeys.has(root)) {
      dependencies.add(root);
      return;
    }

    if (root === "locals" && parts.length > 1) {
      const nested = parts[1];
      if (knownKeys.has(nested)) dependencies.add(nested);
    }
  }

  function traverse(tokens) {
    if (!Array.isArray(tokens)) return;

    for (const token of tokens) {
      if (!token) continue;

      const type = token[0];

      if (type === "name" || type === "&" || type === "{") {
        register(token[1]);
        continue;
      }

      if (type === "#" || type === "^") {
        register(token[1]);
        traverse(token[4]);
        if (token.length > 5) traverse(token[5]);
        continue;
      }
    }
  }

  function parse(template) {
    if (!template || typeof template !== "string") return;

    let tokens;

    try {
      tokens = mustache.parse(template);
    } catch (err) {
      return;
    }

    traverse(tokens);
  }

  parse(viewContent);

  Object.keys(partials || {}).forEach((name) => {
    parse(partials[name]);
  });

  return Array.from(dependencies).sort();
}

function buildSignature(view, partials, templateLocals, partialLocals) {
  const viewLocals = isPlainObject(view && view.locals) ? view.locals : {};
  const metadataLocals = isPlainObject(templateLocals) ? templateLocals : {};
  const partialLocalsObj = isPlainObject(partialLocals) ? partialLocals : {};
  
  const availableKeys = [
    ...Object.keys(viewLocals),
    ...Object.keys(metadataLocals),
    ...Object.keys(partialLocalsObj),
  ];

  const localKeys = collectTemplateLocalKeys(
    view && view.content,
    partials,
    availableKeys
  );

  const localsSignature = {};

  for (const key of localKeys) {
    // Precedence: metadata locals > view locals > partial locals
    if (Object.prototype.hasOwnProperty.call(metadataLocals, key)) {
      localsSignature[key] = metadataLocals[key];
    } else if (Object.prototype.hasOwnProperty.call(viewLocals, key)) {
      localsSignature[key] = viewLocals[key];
    } else if (Object.prototype.hasOwnProperty.call(partialLocalsObj, key)) {
      localsSignature[key] = partialLocalsObj[key];
    }
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

  return JSON.stringify(sortObject(signature));
}

/**
 * Recursively collect locals from partial views
 */
async function collectPartialLocals(templateID, partialNames, processedPartials = new Set()) {
  const partialLocals = {};

  if (!partialNames || Object.keys(partialNames).length === 0) {
    return partialLocals;
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

      // Recursively collect locals from nested partials
      const nestedPartials = isPlainObject(partialView.partials)
        ? partialView.partials
        : {};
      const nestedLocals = await collectPartialLocals(templateID, nestedPartials, processedPartials);
      
      // Merge nested locals (earlier partials take precedence)
      Object.keys(nestedLocals).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(partialLocals, key)) {
          partialLocals[key] = nestedLocals[key];
        }
      });
    } catch (err) {
      // Non-fatal if partial view doesn't exist - continue processing
      continue;
    }
  }

  return partialLocals;
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

  // Collect partial view locals recursively
  const partialLocals = await collectPartialLocals(templateID, viewPartials);

  // Build signature and return hash
  const signature = buildSignature(view, partials, metadata.locals, partialLocals);
  return hash(signature);
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

      // Process each target sequentially
      for (const target of sortedTargets) {
        try {
          const hash = await processTarget(templateID, ownerID, target, metadata);
          if (hash) {
            manifest[target] = hash;
          }
        } catch (err) {
          // If processing a target fails, continue with others
          // but log the error
          console.error(`Error processing CDN target ${target}:`, err);
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

