const config = require("config");
const path = require("path");
const Template = require("models/template");
const { promisify } = require("util");

const getMetadata = promisify(Template.getMetadata);

module.exports = function (req, _res, callback) {
  resolveManifest(req)
    .then((manifest) => callback(null, createCdnHelper(req, manifest)))
    .catch((err) => callback(err));
};

async function resolveManifest(req) {
  if (req && req.template) {
    if (req.template.cdn && typeof req.template.cdn === "object") {
      return req.template.cdn;
    }

    if (req.template._cdnManifest) {
      return req.template._cdnManifest;
    }
  }

  if (req && req._cdnManifest) {
    return req._cdnManifest;
  }

  const templateID =
    (req && req.template && req.template.id) ||
    (req && req.blog && req.blog.template);

  if (!templateID) return {};

  try {
    const metadata = await getMetadata(templateID);
    const manifest = (metadata && metadata.cdn) || {};

    if (req && req.template) {
      req.template._cdnManifest = manifest;
    } else if (req) {
      req._cdnManifest = manifest;
    }

    return manifest;
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return {};
    }

    throw err;
  }
}

function createCdnHelper(req, manifest) {
  const helper = function (text, render) {
    let rendered = typeof render === "function" ? render(text) : text;

    if (!rendered) return "";

    rendered = String(rendered).trim();

    if (!rendered) return "";

    if (/^https?:\/\//i.test(rendered) || /^\/\//.test(rendered)) {
      return rendered;
    }

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
