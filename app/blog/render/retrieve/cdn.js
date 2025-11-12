const config = require("config");
const path = require("path");

module.exports = function (req, res, callback) {
  return callback(null, function () {
    const manifest = (req && req.template && req.template.cdn) || {};

    // Section: {{#cdn}}/path/to/file{{/cdn}}
    var renderCdn = function (text, render) {
      try {
        let rendered = typeof render === "function" ? render(text) : text;

        if (!rendered) return "";

        rendered = String(rendered).trim();

        if (!rendered) return "";

        const renderedNormalized = rendered.startsWith("/")
          ? rendered.slice(1)
          : rendered;
        const templateID = req.template && req.template.id;

        if (
          templateID &&
          Object.prototype.hasOwnProperty.call(manifest, renderedNormalized)
        ) {
          const hash = manifest[renderedNormalized];
          const ext = path.extname(renderedNormalized) || "";
          const viewNameWithoutExtension = ext
            ? renderedNormalized.slice(0, -ext.length)
            : renderedNormalized;
          const encodedView = encodeViewSegment(viewNameWithoutExtension);

          // New URL format: /template/viewname.digest.extension
          // Use full 32-char hash
          return (
            config.cdn.origin + "/template/" + encodedView + "." + hash + ext
          );
        }

        return rendered;
      } catch (e) {
        return text;
      }
    };

    // Interpolation: {{cdn}}
    renderCdn.toString = function () {
      return config.cdn.origin;
    };

    return renderCdn;
  });
};

function encodeViewSegment(segment) {
  if (!segment) return "";

  return segment
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");
}
