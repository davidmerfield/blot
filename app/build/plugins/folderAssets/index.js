const config = require("config");
const lookupFile = require("blog/render/replaceFolderLinks/lookupFile");
const blogHosts = require("blog/lib/blogHosts");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

const parseSrcset = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const candidates = value.split(",");
  const parsed = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    const parts = trimmed.split(/\s+/);
    const url = parts.shift();
    if (!url) {
      return null;
    }

    parsed.push({
      url,
      descriptor: parts.length ? parts.join(" ") : "",
    });
  }

  return parsed;
};

function hostPatternsFor(options) {
  const hosts = blogHosts({
    handle: options.handle,
    domain: options.domain,
  });
  return hosts.map((host) => new RegExp(`^(?:https?:)?//${host}`));
}

function shouldLookup(value, hostPatterns) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:")) return false;
  if (config.cdn && config.cdn.origin && value.indexOf(config.cdn.origin) === 0) {
    return false;
  }

  const isRelative = value.indexOf("://") === -1 && !value.startsWith("//");
  const matchesHost = hostPatterns.some((pattern) => pattern.test(value));
  if (!isRelative && !matchesHost) return false;

  let path = value;
  hostPatterns.forEach((pattern) => {
    path = path.replace(pattern, "");
  });

  return !htmlExtRegex.test(path) && fileExtRegex.test(path);
}

function lookupPath(value, hostPatterns) {
  let path = value;
  hostPatterns.forEach((pattern) => {
    path = path.replace(pattern, "");
  });
  return path;
}

async function rewriteValue(value, options, hostPatterns, dependencies) {
  if (!shouldLookup(value, hostPatterns)) return value;

  const path = lookupPath(value, hostPatterns);
  const result = await lookupFile(
    options.blogID,
    options.cacheID,
    path
  );

  if (result === "ENOENT") return value;

  const dep = path.split("?")[0].split("#")[0];
  if (dep && dependencies.indexOf(dep) === -1) {
    dependencies.push(dep.startsWith("/") ? dep : "/" + dep);
  }
  return result;
}

function render($, callback, options) {
  if (!options || !options.blogID) return callback();

  const hostPatterns = hostPatternsFor(options);
  const dependencies = [];
  const nodes = $("[href], [src], [poster], [srcset]").toArray();

  (async () => {
    for (const node of nodes) {
      const $el = $(node);

      for (const attr of ["href", "src", "poster"]) {
        const current = $el.attr(attr);
        if (current === undefined) continue;
        const next = await rewriteValue(
          current,
          options,
          hostPatterns,
          dependencies
        );
        if (next !== current) $el.attr(attr, next);
      }

      const srcset = $el.attr("srcset");
      if (!srcset) continue;

      const candidates = parseSrcset(srcset);
      if (!candidates) continue;

      const rebuilt = [];
      for (const candidate of candidates) {
        const next = await rewriteValue(
          candidate.url,
          options,
          hostPatterns,
          dependencies
        );
        rebuilt.push(
          candidate.descriptor ? `${next} ${candidate.descriptor}` : next
        );
      }
      $el.attr("srcset", rebuilt.join(", "));
    }

    callback(null, { newDependencies: dependencies });
  })().catch(() => callback());
}

module.exports = {
  render: render,
  isDefault: true,
  category: "images",
  title: "Folder assets",
  description:
    "Rewrite file links in posts to versioned CDN URLs at build time",
};
