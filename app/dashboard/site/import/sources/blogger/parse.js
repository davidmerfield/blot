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

function permalinkSlug(permalink) {
  try {
    const pathname = new URL(permalink).pathname;
    return decodeURIComponent(pathname)
      .replace(/\.(?:html?|xhtml)$/i, "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\//g, "-");
  } catch (err) {
    return "";
  }
}

module.exports = async function parse(xml) {
  const document = await parseStringPromise(xml);
  const atomEntries = (document.feed && document.feed.entry) || [];
  const entries = [];

  for (const atomEntry of atomEntries) {
    const categories = atomEntry.category || [];
    const kindCategory = categories.find(
      ({ $ = {} }) => $.term && $.term.indexOf(KIND_PREFIX) === 0
    );
    const kind = kindCategory && kindCategory.$.term.slice(KIND_PREFIX.length);
    const draft = value(
      atomEntry["app:control"] && atomEntry["app:control"][0]["app:draft"]
    ).toLowerCase() === "yes";

    // An export also contains comments and Blogger's internal configuration.
    if ((kind !== "post" && kind !== "page") || draft) continue;

    const alternate = (atomEntry.link || []).find(
      ({ $ = {} }) => $.rel === "alternate" && $.href
    );
    const permalink = alternate && alternate.$.href;
    const rawTitle = value(atomEntry.title && atomEntry.title[0]).trim();
    const slug = permalinkSlug(permalink);
    const published = Date.parse(value(atomEntry.published && atomEntry.published[0]));
    const updated = Date.parse(value(atomEntry.updated && atomEntry.updated[0]));

    entries.push({
      id: value(atomEntry.id && atomEntry.id[0]),
      title: rawTitle || slug.split("-").pop() || "Untitled",
      html: value(atomEntry.content && atomEntry.content[0]),
      permalink,
      slug,
      page: kind === "page",
      draft: false,
      dateStamp: Number.isNaN(published) ? undefined : published,
      created: Number.isNaN(published) ? undefined : published,
      updated: Number.isNaN(updated) ? undefined : updated,
      tags: categories
        .filter(({ $ = {} }) => $.scheme === LABEL_SCHEME && $.term)
        .map(({ $ }) => $.term),
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
