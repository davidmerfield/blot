const config = require("config");
const fs = require("fs-extra");
const crypto = require("crypto");
const { join, resolve } = require("path");
const { promisify } = require("util");
const hash = require("helper/hash");
const HashFile = require("helper/transformer/hash");
const caseSensitivePath = promisify(require("helper/caseSensitivePath"));
const BLOT_CDN_TOKEN = require("blog/render/replaceFolderLinks/cdnToken");
const unwrapFolderLink = require("blog/render/replaceFolderLinks/unwrapFolderLink");
const { isReservedStaticPath } = require("blog/lib/staticPaths");
const {
  htmlExtRegex,
  fileExtRegex,
  parseSrcset,
} = require("blog/render/replaceFolderLinks/shared");

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
// The baked version is frozen into entry.html, so every file baked here is
// returned as a new dependency: entry.dependencies is diffed into a Redis
// reverse index by app/models/entry/_rebuildDependencyGraph.js, and
// app/sync/update/rebuildDependents.js rebuilds (and so re-bakes) any entry
// that depends on a file whenever it changes, is renamed, or is deleted.
// app/build/dependencies/index.js only records href/src, so poster and
// srcset (and links spliced in from another entry's already-baked HTML by
// the wikilinks plugin) would otherwise never invalidate.
//
// Links that are already baked for this blog are unwrapped and re-baked
// rather than skipped, so a copy of another entry's HTML (wikilink embeds)
// gets a fresh version instead of the embedded entry's stale one.
function render($, callback, options) {
  const blogID = options.blogID;
  const blogFolder = join(config.blog_folder_dir, blogID);
  const dependencies = new Set();
  const ctx = { blogID, blogFolder, dependencies };
  const promises = [];

  $("[href], [src], [poster], [srcset]").each(function () {
    const $el = $(this);

    ATTRS.forEach((attr) => {
      const value = $el.attr(attr);

      if (!value || typeof value !== "string") return;

      promises.push(
        bakeValue(ctx, value).then((result) => {
          if (result !== null) $el.attr(attr, result);
        })
      );
    });

    const srcset = $el.attr("srcset");

    if (srcset) {
      promises.push(
        rewriteSrcset(ctx, srcset).then((rebuilt) => {
          if (rebuilt !== null) $el.attr("srcset", rebuilt);
        })
      );
    }
  });

  Promise.all(promises)
    .then(() => callback(null, { newDependencies: Array.from(dependencies) }))
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
  if (value.indexOf(BLOT_CDN_TOKEN) > -1) return false;
  if (value.charAt(0) !== "/") return false;

  const pathPart = pathPartOf(value);

  // Reserved prefixes are served from Blot's global static directory, not
  // the blog folder (see lookupFile.js and helper/transformer/ownHost.js).
  // Leave them unbaked so request-time resolution still binds to the
  // global static file instead of a same-named file in the blog folder.
  if (isReservedStaticPath(pathPart)) return false;

  if (htmlExtRegex.test(pathPart)) return false;
  if (!fileExtRegex.test(pathPart)) return false;

  return true;
}

// Returns the new attribute value, or null to leave it untouched.
async function bakeValue(ctx, value) {
  const unwrapped = unwrapFolderLink(value, ctx.blogID);
  const wasBaked = unwrapped !== null;
  const raw = wasBaked ? unwrapped : value;

  if (!isEligible(raw)) return null;

  const result = await resolveBuildFile(ctx.blogID, ctx.blogFolder, raw, wasBaked);

  if (result) {
    ctx.dependencies.add(result.path);
    return result.url;
  }

  // The file behind an already-baked link is gone: drop back to the plain
  // path so request-time resolution decides, instead of keeping a URL that
  // points at a now-missing versioned file.
  if (wasBaked) {
    ctx.dependencies.add(pathPartOf(raw));
    return raw;
  }

  return null;
}

async function rewriteSrcset(ctx, value) {
  const candidates = parseSrcset(value);
  if (!candidates) return null;

  let changed = false;

  const rebuilt = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await bakeValue(ctx, candidate.url);
      const url = result === null ? candidate.url : result;

      if (result !== null) changed = true;

      return candidate.descriptor ? `${url} ${candidate.descriptor}` : url;
    })
  );

  return changed ? rebuilt.join(", ") : null;
}

// Resolves a folder-relative attribute value (already an absolute path
// inside the blog's folder, per app/build/dependencies/index.js) into a
// %%BLOT_CDN%%-prefixed, versioned URL. Returns { url, path } (path being
// the case-corrected file path, for recording as a dependency), or null
// (ENOENT) if there's no matching file - mirroring
// app/blog/render/replaceFolderLinks/lookupFile.js's "leave untouched"
// behavior. alreadyDecoded is set for paths recovered from an
// already-baked link, which hold the real (unencoded) file path.
async function resolveBuildFile(blogID, blogFolder, value, alreadyDecoded) {
  const hashIndex = value.indexOf("#");
  const hash_ = hashIndex > -1 ? value.slice(hashIndex) : "";
  value = hashIndex > -1 ? value.slice(0, hashIndex) : value;

  if (!alreadyDecoded && value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch (err) {
      // e.g. '100% luck.jpg' will throw an error - leave value unchanged
    }
  }

  const [pathFromValue, ...rest] = value.split("?");
  const query = rest.length ? `?${rest.join("?")}` : "";

  // Same check as isEligible, but after percent-decoding (e.g. /f%6Fnts).
  if (isReservedStaticPath(pathFromValue)) return null;

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

  return {
    url: `${BLOT_CDN_TOKEN}/folder/v-${version}/${blogID}${resolvedPath}${query}${hash_}`,
    path: resolvedPath,
  };
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
  // Internal build optimization, not a user setting: always runs, and is
  // hidden from the plugins page (see dashboard/site/load/plugins.js).
  optional: false,
  category: "assets",
  title: "Folder assets",
  description:
    "Bake relative links to files in the blog's folder into versioned CDN URLs at build time",
};
