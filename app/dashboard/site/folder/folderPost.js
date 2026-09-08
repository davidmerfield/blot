const path = require("path");
const basename = path.basename;
const Entry = require("models/entry");
const moment = require("moment");
const fs = require("fs-extra");
const localPath = require("helper/localPath");
const pathNormalize = require("helper/pathNormalizer");
const Build = require("build");

require("moment-timezone");

// Show the first N source files inline; the rest sit behind a "Show all"
// toggle so the post information stays near the top of the page.
const VISIBLE_SOURCE_LIMIT = 10;

const SYNTHETIC_DEPENDENCY_PREFIXES = [
  "/__wikilink_slug__/",
  "/__wikilink_filename__/",
];

const findMultiFolder =
  (Build && Build.findMultiFolder) ||
  function () {
    return null;
  };

// Given a directory path, work out whether it is the top-level "+" folder of a
// folder post (rather than a plain sub-folder inside one). Returns the
// findMultiFolder info when it is, otherwise null.
function folderPostInfoFor(dir) {
  const normalized = pathNormalize(dir);
  const info = findMultiFolder(normalized);

  if (!info) return null;
  if (pathNormalize(info.folderPath) !== normalized) return null;

  return info;
}

// Build the data the dashboard needs to render the aggregated view for a "+"
// folder. Resolves to null when the folder has not produced a published entry
// yet (empty folder, still syncing, converters disabled, ...), in which case
// the caller falls back to the normal directory listing.
async function getFolderPost(blog, dir) {
  const info = folderPostInfoFor(dir);

  if (!info) return null;

  const entry = await new Promise((resolve) => {
    Entry.get(blog.id, info.entryPath, resolve);
  });

  if (!entry || entry.deleted) return null;
  if (!isMultiEntry(entry)) return null;

  const sourcePaths = sourcePathsForEntry(entry);

  const existence = await Promise.all(
    sourcePaths.map((sourcePath) =>
      fs.pathExists(localPath(blog.id, sourcePath)).catch(() => false)
    )
  );

  const sources = sourcePaths.map((sourcePath, index) => ({
    path: sourcePath,
    name: basename(sourcePath),
    url: encodePath(sourcePath),
    displayIndex: index + 1,
    exists: existence[index],
    hidden: index >= VISIBLE_SOURCE_LIMIT,
  }));

  const hiddenCount = sources.filter((source) => source.hidden).length;

  formatEntry(entry, blog);

  return {
    folderPath: info.folderPath,
    folderUrl: encodePath(info.folderPath),
    entryPath: info.entryPath,
    entry: entry,
    sources: sources,
    sourceCount: sources.length,
    hiddenCount: hiddenCount,
    truncated: hiddenCount > 0,
    visibleLimit: VISIBLE_SOURCE_LIMIT,
    hasMissing: sources.some((source) => !source.exists),
  };
}

function formatEntry(entry, blog) {
  entry.type = entry.draft ? "draft" : entry.page ? "page" : "post";
  entry.Type = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);

  entry.converter = { multi: true };

  entry.date = moment
    .utc(entry.dateStamp)
    .tz(blog.timeZone)
    .format("MMMM Do YYYY, h:mma");

  if (entry.draft) {
    entry.url = "/draft/view" + entry.path;
  }

  entry.tags = (entry.tags || []).map((tag, i, arr) => ({
    tag,
    first: i === 0,
    last: i === arr.length - 1,
  }));

  entry.backlinks = (entry.backlinks || []).map((backlink) => ({ backlink }));

  entry.internalLinks = (entry.internalLinks || []).map((internalLink) => ({
    internalLink,
  }));

  entry.dependencies = (entry.dependencies || [])
    .filter((dependency) => !isSyntheticDependency(dependency))
    .map((dependency) => ({ dependency }));

  const rawMetadata = { ...(entry.metadata || {}) };
  delete rawMetadata._sourcePaths;
  entry.metadata = Object.keys(rawMetadata).map((key) => ({
    key,
    value: rawMetadata[key],
  }));

  if (entry.scheduled) {
    entry.url += "?scheduled=true";
    entry.toNow = moment.utc(entry.dateStamp).fromNow();
  }
}

function isMultiEntry(entry) {
  if (!entry || entry.deleted) return false;

  if (isFolderPostHtml(entry.html)) return true;

  return !!(
    entry.metadata &&
    Array.isArray(entry.metadata._sourcePaths) &&
    entry.metadata._sourcePaths.length > 0
  );
}

function sourcePathsForEntry(entry) {
  if (
    entry &&
    entry.metadata &&
    Array.isArray(entry.metadata._sourcePaths) &&
    entry.metadata._sourcePaths.length
  ) {
    return entry.metadata._sourcePaths.slice();
  }

  return sourcePathsFromHtml(entry && entry.html);
}

function isFolderPostHtml(html) {
  return (
    typeof html === "string" && html.indexOf('class="multi-file-post"') !== -1
  );
}

function sourcePathsFromHtml(html) {
  if (!isFolderPostHtml(html)) return [];

  const paths = [];
  const pattern = /<section class="multi-file-entry"[^>]*\sdata-file="([^"]*)"/g;
  let match;

  while ((match = pattern.exec(html))) {
    paths.push(unescapeAttribute(match[1]));
  }

  return paths;
}

function unescapeAttribute(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function encodePath(input) {
  return input
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isSyntheticDependency(dependency) {
  return SYNTHETIC_DEPENDENCY_PREFIXES.some(
    (prefix) => dependency.indexOf(prefix) === 0
  );
}

module.exports = getFolderPost;
module.exports.folderPostInfoFor = folderPostInfoFor;
