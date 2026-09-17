const config = require("config");
const fs = require("fs-extra");
const crypto = require("crypto");
const { join, resolve } = require("path");
const { promisify } = require("util");
const hash = require("helper/hash");
const HashFile = require("helper/transformer/hash");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));
const BLOT_CDN_TOKEN = require("blog/render/replaceFolderLinks/cdnToken");

const hashFileAsync = promisify(HashFile);

// Files bigger than this fall back to the cheap stat-based fingerprint
// (mtime+ctime+size) instead of a full content hash, so a rebuild
// triggered by an unrelated dependency change doesn't force reading a
// huge video/audio file just to version its URL.
const MAX_CONTENT_HASH_SIZE = 5 * 1024 * 1024;

// Below this, read the whole file into memory and hash it synchronously
// instead of going through helper/transformer/hash's readable-stream
// pipeline. Most folder-relative links point at small images/fonts, and
// a stream's setup/event overhead measurably dominates the hash itself at
// this size - a single buffered read+digest is faster in practice.
const SMALL_FILE_HASH_SIZE = 256 * 1024;

const ATTRS = ["href", "src", "poster"];
const htmlExtRegex = /\.html$/i;
const fileExtRegex = /[^/]*\.[^/]*$/;

// An entry belongs to exactly one blog forever, so - unlike template CSS/JS,
// which can be rendered by many different blogs - a relative link inside an
// entry's content can be resolved to a versioned CDN URL once, at build
// time, instead of on every request. This plugin runs at the end of the
// render-stage plugin list (app/build/plugins/index.js), after everything
// that could itself introduce a new folder-relative link (e.g. autoImage),
// and rewrites href/src/poster/srcset attributes that
// app/build/dependencies/index.js has already resolved to absolute paths
// inside the blog's own folder. The result is baked with the %%BLOT_CDN%%
// token (see cdnToken.js) rather than the real CDN origin, which
// middleware.js resolves unconditionally on every response.
//
// This is safe without any new invalidation plumbing: entry.dependencies
// (recorded by app/build/dependencies/index.js) is diffed into a Redis
// reverse index by app/models/entry/_rebuildDependencyGraph.js, and
// app/sync/update/rebuildDependents.js already rebuilds (and so re-bakes)
// any entry that depends on a file whenever that file changes, is renamed,
// or is deleted.
function render($, callback, options) {
  const blogID = options.blogID;
  const blogFolder = join(config.blog_folder_dir, blogID);
  const promises = [];

  $("[href], [src], [poster], [srcset]").each(function () {
    const $el = $(this);

    ATTRS.forEach((attr) => {
      const value = $el.attr(attr);

      if (!isEligible(value)) return;

      promises.push(
        resolveBuildFile(blogID, blogFolder, value).then((result) => {
          if (result) $el.attr(attr, result);
        })
      );
    });

    const srcset = $el.attr("srcset");

    if (srcset) {
      promises.push(
        rewriteSrcset(blogID, blogFolder, srcset).then((rebuilt) => {
          if (rebuilt !== null) $el.attr("srcset", rebuilt);
        })
      );
    }
  });

  Promise.all(promises)
    .then(() => callback())
    .catch((err) => callback(err));
}

function pathPartOf(value) {
  const cutIndex = value.search(/[#?]/);
  return cutIndex === -1 ? value : value.slice(0, cutIndex);
}

function isEligible(value) {
  if (!value || typeof value !== "string") return false;
  if (value.indexOf("://") > -1) return false;
  if (value.startsWith("data:")) return false;
  if (value.indexOf(BLOT_CDN_TOKEN) === 0) return false;
  if (value.charAt(0) !== "/") return false;

  const pathPart = pathPartOf(value);

  if (htmlExtRegex.test(pathPart)) return false;
  if (!fileExtRegex.test(pathPart)) return false;

  return true;
}

function parseSrcset(value) {
  const candidates = value.split(",");
  const parsed = [];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(/\s+/);
    const url = parts.shift();
    if (!url) return null;

    parsed.push({ url, descriptor: parts.length ? parts.join(" ") : "" });
  }

  return parsed;
}

async function rewriteSrcset(blogID, blogFolder, value) {
  const candidates = parseSrcset(value);
  if (!candidates) return null;

  let changed = false;

  const rebuilt = await Promise.all(
    candidates.map(async (candidate) => {
      if (!isEligible(candidate.url)) {
        return candidate.descriptor
          ? `${candidate.url} ${candidate.descriptor}`
          : candidate.url;
      }

      const result = await resolveBuildFile(blogID, blogFolder, candidate.url);

      if (!result) {
        return candidate.descriptor
          ? `${candidate.url} ${candidate.descriptor}`
          : candidate.url;
      }

      changed = true;

      return candidate.descriptor ? `${result} ${candidate.descriptor}` : result;
    })
  );

  return changed ? rebuilt.join(", ") : null;
}

// Resolves a folder-relative attribute value (already an absolute path
// inside the blog's folder, per app/build/dependencies/index.js) into a
// %%BLOT_CDN%%-prefixed, versioned URL. Returns null (ENOENT) if there's
// no matching file - mirroring app/blog/render/replaceFolderLinks/lookupFile.js's
// "leave untouched" behavior.
async function resolveBuildFile(blogID, blogFolder, value) {
  const hashIndex = value.indexOf("#");
  const hash_ = hashIndex > -1 ? value.slice(hashIndex) : "";
  value = hashIndex > -1 ? value.slice(0, hashIndex) : value;

  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch (err) {
      // e.g. '100% luck.jpg' will throw an error - leave value unchanged
    }
  }

  const [pathFromValue, ...rest] = value.split("?");
  const query = rest.length ? `?${rest.join("?")}` : "";

  let stat, resolvedPath;

  try {
    ({ stat, path: resolvedPath } = await getStat(
      blogFolder,
      resolve("/", pathFromValue)
    ));
  } catch (err) {
    return null;
  }

  const version = await computeVersion(join(blogFolder, resolvedPath), stat);

  return `${BLOT_CDN_TOKEN}/folder/v-${version}/${blogID}${resolvedPath}${query}${hash_}`;
}

async function computeVersion(filePath, stat) {
  if (stat.size > MAX_CONTENT_HASH_SIZE) {
    return hash(`${stat.mtime}${stat.ctime}${stat.size}`).slice(0, 8);
  }

  try {
    if (stat.size <= SMALL_FILE_HASH_SIZE) {
      const buffer = await fs.readFile(filePath);
      return crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 8);
    }

    const contentHash = await hashFileAsync(filePath);
    return contentHash.slice(0, 8);
  } catch (err) {
    return hash(`${stat.mtime}${stat.ctime}${stat.size}`).slice(0, 8);
  }
}

async function getStat(blogFolder, path) {
  const filePath = join(blogFolder, path);

  try {
    const stat = await fs.stat(filePath);
    return { stat, path };
  } catch (e) {}

  const resolvedPath = await caseSensitivePath(blogFolder, path);
  const resolvedRelativePath = resolvedPath.slice(blogFolder.length);
  const stat = await fs.stat(resolvedPath);
  return { stat, path: resolvedRelativePath };
}

module.exports = {
  render,
  category: "assets",
  title: "Folder assets",
  description:
    "Bake relative links to files in the blog's folder into versioned CDN URLs at build time",
};
