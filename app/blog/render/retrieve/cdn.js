const config = require("config");
const path = require("path");

const HASH_LENGTH = 7;

module.exports = function (req, res, callback) {
  return callback(null, function () {
    const manifest = (req && req.template && req.template.cdn) || {};

    // Section: {{#cdn}}/path/to/file{{/cdn}}
    var renderCdn = function (text, render) {
      let rendered = typeof render === "function" ? render(text) : text;

      if (!rendered) return "";

      rendered = String(rendered).trim();

      if (!rendered) return "";

      rendered = rendered.startsWith("/") ? rendered.slice(1) : rendered;

      const templateID = req.template && req.template.id;

      if (
        templateID &&
        Object.prototype.hasOwnProperty.call(manifest, rendered)
      ) {
        const hash = manifest[rendered].slice(0, HASH_LENGTH);
        const ext = path.extname(rendered) || "";
        const viewNameWithoutExtension = ext
          ? rendered.slice(0, -ext.length)
          : rendered;
        const encodedView = encodeViewSegment(viewNameWithoutExtension);
        const encodedTemplate = encodeURIComponent(templateID);

        return (
          config.cdn.origin +
          "/template/" +
          req.blog.id +
          "/" +
          encodedTemplate +
          "/" +
          encodedView +
          "." +
          hash +
          ext
        );
      }

      return rendered;
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
