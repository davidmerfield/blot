const { parseStringPromise } = require("xml2js");
const { URL } = require("url");

const KIND_PREFIX = "http://schemas.google.com/blogger/2008/kind#";
const LABEL_SCHEME = "http://www.blogger.com/atom/ns#";

function value(node) {
  if (node === undefined || node === null) return "";
  if (Array.isArray(node)) return value(node[0]);
  if (typeof node === "string") return node;
  return node._ || "";
}

// Older Blogger backups expose the post URL on link[rel=alternate]. Current
// exports use blogger:filename with a path like /2020/01/post.html.
function permalinkPath(permalink) {
  if (!permalink) return "";
  try {
    return new URL(permalink, "https://blogger.invalid").pathname;
  } catch (err) {
    return "";
  }
}

function permalinkSlug(permalink) {
  const pathname = permalinkPath(permalink);
  if (!pathname) return "";
  try {
    return decodeURIComponent(pathname)
      .replace(/\.(?:html?|xhtml)$/i, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\//g, "-");
  } catch (err) {
    return "";
  }
}

function permalinkBasename(permalink) {
  const pathname = permalinkPath(permalink);
  if (!pathname) return "";
  try {
    const component = pathname.split("/").filter(Boolean).pop();
    return component
      ? decodeURIComponent(component).replace(/\.(?:html?|xhtml)$/i, "")
      : "";
  } catch (err) {
    return "";
  }
}

function entryKind(atomEntry) {
  const bloggerType = value(atomEntry["blogger:type"]).toLowerCase();
  if (bloggerType === "post" || bloggerType === "page") return bloggerType;

  const categories = atomEntry.category || [];
  const kindCategory = categories.find(
    (category) =>
      category &&
      category.$ &&
      category.$.term &&
      category.$.term.indexOf(KIND_PREFIX) === 0
  );
  return kindCategory
    ? kindCategory.$.term.slice(KIND_PREFIX.length).toLowerCase()
    : "";
}

function isDraft(atomEntry) {
  const status = value(atomEntry["blogger:status"]).toLowerCase();
  if (status === "draft") return true;

  return (
    value(
      atomEntry["app:control"] && atomEntry["app:control"][0]["app:draft"]
    ).toLowerCase() === "yes"
  );
}

function isTrashed(atomEntry) {
  return Boolean(value(atomEntry["blogger:trashed"]));
}

function entryPermalink(atomEntry) {
  const alternate = (atomEntry.link || []).find(
    (link) => link && link.$ && link.$.rel === "alternate" && link.$.href
  );
  if (alternate) return alternate.$.href;

  const filename = value(atomEntry["blogger:filename"]).trim();
  return filename || undefined;
}

function entryTags(categories) {
  return (categories || [])
    .filter(
      (category) =>
        category &&
        category.$ &&
        category.$.scheme === LABEL_SCHEME &&
        category.$.term
    )
    .map(({ $ }) => $.term);
}

module.exports = async function parse(xml) {
  const document = await parseStringPromise(xml);
  const atomEntries = (document.feed && document.feed.entry) || [];
  const entries = [];

  for (const atomEntry of atomEntries) {
    const kind = entryKind(atomEntry);

    // An export also contains comments and Blogger's internal configuration.
    if ((kind !== "post" && kind !== "page") || isDraft(atomEntry) || isTrashed(atomEntry))
      continue;

    const permalink = entryPermalink(atomEntry);
    const rawTitle = value(atomEntry.title && atomEntry.title[0]).trim();
    const slug = permalinkSlug(permalink);
    const published = Date.parse(value(atomEntry.published && atomEntry.published[0]));
    const updated = Date.parse(value(atomEntry.updated && atomEntry.updated[0]));

    entries.push({
      id: value(atomEntry.id && atomEntry.id[0]),
      title: rawTitle || permalinkBasename(permalink) || "Untitled",
      html: value(atomEntry.content && atomEntry.content[0]),
      permalink,
      slug,
      page: kind === "page",
      draft: false,
      dateStamp: Number.isNaN(published) ? undefined : published,
      created: Number.isNaN(published) ? undefined : published,
      updated: Number.isNaN(updated) ? undefined : updated,
      tags: entryTags(atomEntry.category),
    });
  }

  // determine_path uses the slug as the filename. Suffix repeated slugs in source
  // order so no entry can silently overwrite another and repeat imports are stable.
  const occurrences = new Map();
  for (const entry of entries) {
    const base = entry.slug || entry.title || "untitled";
    const count = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, count);
    entry.slug = count === 1 ? base : `${base}-${count}`;
  }

  return entries;
};

module.exports.permalinkSlug = permalinkSlug;
