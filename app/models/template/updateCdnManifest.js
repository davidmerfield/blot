const async = require("async");
const ensure = require("helper/ensure");
const hash = require("helper/hash");
const client = require("models/client");
const key = require("./key");
const getMetadata = require("./getMetadata");
const getView = require("./getView");
const getPartials = require("./getPartials");

function buildSignature(view, partials) {
  const signature = {
    content: (view && view.content) || "",
    partials: {},
  };

  const keys = Object.keys(partials || {}).sort();
  for (const name of keys) {
    signature.partials[name] = partials[name] || "";
  }

  return JSON.stringify(signature);
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

              const signature = buildSignature(view, partials);
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
