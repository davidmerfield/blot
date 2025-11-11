const config = require("config");
const path = require("path");

module.exports = function (req, _res, callback) {
  return callback(null, createCdnHelper(req));
};

function createCdnHelper(req) {
  const helper = function (text, render) {
    let rendered = typeof render === "function" ? render(text) : text;

    if (!rendered) return "";

    rendered = String(rendered).trim();

    if (!rendered) return "";

    if (/^https?:\/\//i.test(rendered) || /^\/\//.test(rendered)) {
      return rendered;
    }

    const manifest = (req.template && req.template.cdn) || {};
    const templateID = req.template && req.template.id;

    if (templateID && Object.prototype.hasOwnProperty.call(manifest, rendered)) {
      const hash = manifest[rendered];
      const ext = path.extname(rendered) || "";
      const encodedView = encodeViewSegment(rendered);
      const encodedTemplate = encodeURIComponent(templateID);

      return (
        config.cdn.origin +
        "/view/" +
        encodedTemplate +
        "/" +
        encodedView +
        "/v-" +
        hash +
        ext
      );
    }

    const prefix = rendered.charAt(0) === "/" ? "" : "/";
    return config.cdn.origin + prefix + rendered;
  };

  helper.toString = function () {
    return config.cdn.origin;
  };

  return helper;
}

function encodeViewSegment(segment) {
  if (!segment) return "";

  return segment
    .split("/")
    .map(function (part) {
      return encodeURIComponent(part);
    })
    .join("/");
}
