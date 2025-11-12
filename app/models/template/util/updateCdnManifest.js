const async = require("async");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("../key");
const getMetadata = require("../getMetadata");
const getView = require("../getView");
const getPartials = require("../getPartials");
const getAllViews = require("../getAllViews");
const mustache = require("mustache");

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

module.exports = function updateCdnManifest(templateID, callback) {
  callback = callback || function () {};

  try {
    ensure(templateID, "string");
  } catch (err) {
    return callback(err);
  }

  getMetadata(templateID, function (err, metadata) {
    if (err) {
      if (err.code === "ENOENT") return callback(null);
      return callback(err);
    }

    if (!metadata.owner) {
      return callback(new Error("Template metadata missing owner"));
    }

    const ownerID = metadata.owner;
    const manifest = {};

    // Get all views and collect CDN targets from their retrieve.cdn arrays
    getAllViews(templateID, function (err, views) {
      if (err) return callback(err);

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

      // Build manifest for each target
      async.eachSeries(
        sortedTargets,
        function (target, next) {
          getView(templateID, target, function (viewErr, view) {
            if (viewErr || !view) {
              // Treat ENOENT errors and "No view:" errors as non-fatal
              const isNonFatalError =
                !viewErr ||
                viewErr.code === "ENOENT" ||
                (viewErr.message && viewErr.message.includes("No view:"));
              return next(isNonFatalError ? null : viewErr);
            }

            // Ensure view.partials is always an object
            const viewPartials = isPlainObject(view.partials)
              ? view.partials
              : {};

            getPartials(ownerID, templateID, viewPartials, function (
              partialErr,
              partials
            ) {
              if (partialErr) return next(partialErr);

              // Collect partial view locals for template views (not entries)
              // This includes nested partials recursively
              const partialLocals = {};
              const processedPartials = new Set(); // Track processed partials to avoid cycles
              
              function collectPartialLocals(partialNames, done) {
                if (!partialNames || Object.keys(partialNames).length === 0) {
                  return done();
                }

                async.eachOfSeries(
                  partialNames,
                  function (partialName, value, partialNext) {
                    // Skip missing
                    if (!partialName) {
                      return partialNext();
                    }

                    // Skip entries (they start with "/") - only process template views
                    if (partialName.charAt(0) === "/") {
                      return partialNext();
                    }

                    // Skip if already processed (avoid cycles)
                    if (processedPartials.has(partialName)) {
                      return partialNext();
                    }

                    processedPartials.add(partialName);

                    getView(templateID, partialName, function (partialViewErr, partialView) {
                      // Non-fatal if partial view doesn't exist
                      if (partialViewErr || !partialView) {
                        return partialNext();
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
                      collectPartialLocals(nestedPartials, partialNext);
                    });
                  },
                  done
                );
              }

              collectPartialLocals(viewPartials, function (partialCollectErr) {
                if (partialCollectErr) return next(partialCollectErr);

                const signature = buildSignature(
                  view,
                  partials,
                  metadata.locals,
                  partialLocals
                );
                manifest[target] = hash(signature);
                next();
              });
            });
          });
        },
        function (seriesErr) {
          if (seriesErr) return callback(seriesErr);

          client.hset(
            key.metadata(templateID),
            "cdn",
            JSON.stringify(manifest),
            function (setErr) {
              if (setErr) return callback(setErr);
              callback(null, manifest);
            }
          );
        }
      );
    });
  });
};

