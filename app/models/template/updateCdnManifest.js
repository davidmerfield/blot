const async = require("async");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("./key");
const getMetadata = require("./getMetadata");
const getView = require("./getView");
const getPartials = require("./getPartials");
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

function buildSignature(view, partials, templateLocals) {
  const viewLocals = isPlainObject(view && view.locals) ? view.locals : {};
  const metadataLocals = isPlainObject(templateLocals) ? templateLocals : {};
  const availableKeys = [
    ...Object.keys(viewLocals),
    ...Object.keys(metadataLocals),
  ];

  const localKeys = collectTemplateLocalKeys(
    view && view.content,
    partials,
    availableKeys
  );

  const localsSignature = {};

  for (const key of localKeys) {
    if (Object.prototype.hasOwnProperty.call(metadataLocals, key)) {
      localsSignature[key] = metadataLocals[key];
    } else if (Object.prototype.hasOwnProperty.call(viewLocals, key)) {
      localsSignature[key] = viewLocals[key];
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

    const ownerID = metadata.owner;
    const manifest = {};

    client.hgetall(key.cdnTargets(templateID), function (error, targets) {
      if (error) return callback(error);

      const entries = Object.entries(targets || {})
        .filter(([, count]) => parseInt(count, 10) > 0)
        .map(([target]) => target)
        .sort();

      async.eachSeries(
        entries,
        function (target, next) {
          getView(templateID, target, function (viewErr, view) {
            if (viewErr || !view) {
              return next(viewErr && viewErr.code !== "ENOENT" ? viewErr : null);
            }

            getPartials(ownerID, templateID, view.partials || {}, function (
              partialErr,
              partials
            ) {
              if (partialErr) return next(partialErr);

              const signature = buildSignature(
                view,
                partials,
                metadata.locals
              );
              manifest[target] = hash(signature);
              next();
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
