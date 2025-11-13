const config = require("config");
const generateCdnUrl = require("models/template/util/generateCdnUrl");

module.exports = function (req, res, callback) {
  return callback(null, function () {
    const manifest = (req && req.template && req.template.cdn) || {};

    // Section: {{#cdn}}/path/to/file{{/cdn}}
    var renderCdn = function (text, render) {
      try {
        // Skip CDN URLs for preview subdomains on non-SITE templates
        if (req.preview) {
          const templateID = req.template && req.template.id;
          if (templateID && !templateID.startsWith('SITE:')) {
            // Return original path for preview subdomains on custom templates
            return typeof render === "function" ? render(text) : text;
          }
        }

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
          return generateCdnUrl(renderedNormalized, hash);
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
