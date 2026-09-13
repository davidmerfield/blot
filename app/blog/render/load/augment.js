const normalize = require("models/tags").normalize;
const type = require("helper/type");
const getCachedEntryByUrl = require("./getCachedEntryByUrl");
const moment = require("moment");
const debug = require("debug")("blog:render:augment");
require("moment-timezone");

// Must stay in sync with projectedEntryLocals in models/template/parseTemplate.js.
// These are the retrieve locals that carry a `fields` map of referenced entry
// properties. A list that records fields.backlinks is the only list we hydrate.
const PROJECTED_ENTRY_LOCALS = [
  "allEntries",
  "all_entries",
  "recentEntries",
  "recent_entries",
  "latestEntry",
  "latest_entry",
  "posts",
  "search_results",
  "tagged",
  "archives",
];

module.exports = async function augment(req, res, entry) {
  const blog = req.blog;

  entry.metadata = createRenderMetadata(entry.metadata);

  // Can be either inherited from the properties of the blog
  // or from the template, or from the view
  const hideDate = res.locals.hide_dates || false;
  const dateDisplay = res.locals.date_display || "MMMM D, Y";

  entry.formatDate = FormatDate(entry.dateStamp, req.blog.timeZone);
  entry.formatUpdated = FormatDate(entry.updated, req.blog.timeZone);
  entry.formatCreated = FormatDate(entry.created, req.blog.timeZone);

  entry.absoluteURL =
    req.blog.locals.blogURL +
    entry.url.split("/").map(encodeURIComponent).join("/");

  // if the entry exif object is empty, delete it
  if (
    entry.exif &&
    type(entry.exif, "object") &&
    Object.keys(entry.exif).length === 0
  ) {
    delete entry.exif;
  }

  // if the entry thumbnail object is empty, delete it
  if (
    entry.thumbnail &&
    type(entry.thumbnail, "object") &&
    Object.keys(entry.thumbnail).length === 0
  ) {
    delete entry.thumbnail;
  }

  const tags = [];
  const tagged = {};
  const totalTags = entry.tags.length;

  for (let i = 0; i < totalTags; i++) {
    const tag = entry.tags[i];

    // augment has already been called on this
    // entry there is a bug in eachEntry
    if (!type(tag, "string")) {
      console.log(
        "Error BAD TAG:",
        req.blog.id,
        req.originalHost,
        req.url,
        "has format date?",
        type(entry.formatDate, "function")
      );
      console.log(tag);
      continue;
    }

    if (!tag) continue;

    const slug = normalize(tag);
    const lower = tag.toLowerCase();

    tagged[tag] = tagged[lower] = tagged[slug] = true;

    tags.push({
      name: tag,
      tag: tag,
      slug: encodeURIComponent(slug),
      first: i === 0,
      last: i === totalTags - 1,
    });
  }

  for (const k in entry.thumbnail) {
    entry.thumbnail[k].ratio =
      (entry.thumbnail[k].height / entry.thumbnail[k].width) * 100 + "%";
  }

  entry.tags = tags;
  entry.tagged = tagged;

  // We don't want to compute the entry's date
  // string if the user explicitly told use to
  // hide the dates. We also want to hide the
  // dates for items in the menu, and items which
  // are pages. Otherwise its weird.
  if (!hideDate && !entry.menu && !entry.page) {
    entry.date = moment
      .utc(entry.dateStamp)
      .tz(blog.timeZone)
      .format(dateDisplay);
  } else {
    delete entry.date;
  }

  entry.backlinks = entry.backlinks || [];

  if (!shouldHydrateBacklinks(req, res, entry)) {
    debug(entry.path, "skipping backlink hydration");
    return;
  }

  debug(entry.path, "fetching backlinks", entry.backlinks);

  const resolved = await Promise.all(
    entry.backlinks.map(async (linkUrl) => {
      debug("Looking up backlink for linkUrl", linkUrl);
      if (typeof linkUrl !== "string") {
        return null;
      }
      const linked = await getCachedEntryByUrl(req.blog, linkUrl);
      if (linked) {
        debug("Found", linked.path, "for", linkUrl);
      } else {
        debug("No entry found for", linkUrl);
      }
      return linked;
    })
  );

  debug(entry.path, "fetched backlinks", resolved);
  entry.backlinks = resolved.filter(
    (backlinkedEntry) =>
      !!backlinkedEntry &&
      // we don't want to show unpublished entries
      !backlinkedEntry.scheduled &&
      // we don't want to show the same entry
      backlinkedEntry.path !== entry.path
  );

  // Deduplicate by path without lodash
  const seen = new Set();
  entry.backlinks = entry.backlinks.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });

  debug(entry.path, "final backlinks", entry.backlinks);
};

// eachEntry walks every Entry in the view - the page's `entry` (plus its
// next/previous) AND every list local (archives, allEntries, posts, ...).
// Hydrating backlinks on list rows is a per-request heap multiplier
// (every post × every backlink) and fights the byte-capped list caches.
// Entry pages still hydrate; list locals only hydrate when parseTemplate
// recorded fields.backlinks (or a boolean retrieve local we can't project).
function shouldHydrateBacklinks(req, res, entry) {
  const primary = res.locals && res.locals.entry;
  if (
    primary &&
    (entry === primary ||
      entry === primary.next ||
      entry === primary.previous)
  ) {
    return true;
  }

  return listLocalNeedsBacklinks(req.retrieve);
}

function listLocalNeedsBacklinks(retrieve) {
  if (!retrieve || typeof retrieve !== "object") return false;

  for (let i = 0; i < PROJECTED_ENTRY_LOCALS.length; i++) {
    const value = retrieve[PROJECTED_ENTRY_LOCALS[i]];
    if (value === undefined) continue;

    // Boolean `true` is stale/unprojected metadata - we can't tell which
    // fields the view reads, so hydrate to be safe.
    if (value === true) return true;

    if (
      value &&
      typeof value === "object" &&
      value.fields &&
      typeof value.fields === "object" &&
      value.fields.backlinks
    ) {
      return true;
    }
  }

  // Older/custom templates bind {{#entries}} (set by the route, not a
  // retrieve module). parseTemplate then records {{#backlinks}} as a
  // top-level retrieve.backlinks rather than a fields map on `posts`.
  // Only honor that when the view actually iterates `entries` - an
  // entry page's {{#entry}}{{#backlinks}} sets retrieve.backlinks too
  // and must not fan out across sidebar lists.
  if (retrieve.entries && retrieveMentionsBacklinks(retrieve)) return true;

  return false;
}

function retrieveMentionsBacklinks(retrieve) {
  if (!retrieve || typeof retrieve !== "object") return false;

  return Object.keys(retrieve).some((key) => {
    return (
      key === "backlinks" ||
      key.endsWith(".backlinks") ||
      key.endsWith(".backlinks.length")
    );
  });
}

function createRenderMetadata(sourceMetadata) {
  if (!sourceMetadata || !type(sourceMetadata, "object")) {
    return sourceMetadata;
  }

  const renderMetadata = Object.assign({}, sourceMetadata);
  const keys = Object.keys(sourceMetadata);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const lowerKey = key.toLowerCase();

    if (
      lowerKey === key ||
      Object.prototype.hasOwnProperty.call(renderMetadata, lowerKey)
    ) {
      continue;
    }

    renderMetadata[lowerKey] = sourceMetadata[key];
  }

  return renderMetadata;
}

function FormatDate(dateStamp, zone) {
  return function () {
    return function (text, render) {
      try {
        text = render(text).trim();
        text = moment.utc(dateStamp).tz(zone).format(text);
      } catch (e) {
        text = "";
      }

      return render(text);
    };
  };
}
