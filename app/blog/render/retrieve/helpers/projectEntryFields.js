// Entry-list locals (allEntries, recentEntries, archives, posts, tagged...)
// historically loaded every entry in full, including the rendered HTML body.
// parseTemplate now records which entry fields a view actually references in
// retrieve metadata, e.g.
//
//   retrieve.allEntries === { fields: { title: true, url: true } }
//
// When that metadata is present we can safely drop the large, unreferenced
// body fields from each entry before they enter res.locals. This keeps
// list/archive pages from holding megabytes of entry HTML in memory for
// content the template never renders.
//
// Backwards compatibility:
//   - Views whose retrieve metadata has not been recalculated yet still store
//     `allEntries: true` (or `{ length: true }`). Without an explicit `fields`
//     map we cannot know which fields are safe to drop, so we strip nothing
//     and behaviour is identical to before.
//   - Only the fields in HEAVY_FIELDS are ever removed. Everything the render
//     pipeline relies on (url, tags, dateStamp, metadata, thumbnail, ...) is
//     always kept, so augment() and friends keep working.

// Large, render-only fields. None of these are read by the render pipeline
// itself (blog/render/load/augment.js, locals.js, ...), only by templates.
var HEAVY_FIELDS = ["html", "body", "teaser", "teaserBody", "summary"];

// Given the full retrieve object and the alias keys a retrieve module answers
// to (e.g. ["allEntries", "all_entries"]), work out the union of referenced
// entry fields. Returns null when projection must be skipped: either no alias
// is referenced, or an alias is referenced without a `fields` map (legacy
// boolean metadata, or non-field access such as `allEntries.length`).
function resolveFields(retrieve, keys) {
  if (!retrieve || typeof retrieve !== "object") return null;

  var referenced = false;
  var merged = {};

  for (var i = 0; i < keys.length; i++) {
    var value = retrieve[keys[i]];

    if (value === undefined) continue;

    referenced = true;

    if (
      !value ||
      typeof value !== "object" ||
      !value.fields ||
      typeof value.fields !== "object"
    ) {
      return null;
    }

    Object.keys(value.fields).forEach(function (field) {
      merged[field] = true;
    });
  }

  return referenced ? merged : null;
}

// Mutates the entries in place, deleting heavy fields the template does not
// reference. Accepts either a list of entries (allEntries, posts, ...) or a
// single entry object (latestEntry). Entries handed to retrieve modules are
// always freshly parsed (or freshly cloned, in the case of the posts/tagged
// caches) so in-place deletion never touches shared or frozen instances.
// Returns the same value it was given for convenience.
function projectEntryFields(entries, retrieve, keys) {
  var isList = Array.isArray(entries);
  var list = isList ? entries : entries ? [entries] : [];

  if (!list.length) return entries;

  var fields = resolveFields(retrieve, Array.isArray(keys) ? keys : [keys]);

  if (!fields) return entries;

  var strip = HEAVY_FIELDS.filter(function (field) {
    return !fields[field];
  });

  if (!strip.length) return entries;

  // Heavy fields we are keeping. A Blot entry's own markup can contain
  // Mustache that renderLocals evaluates later - e.g. an entry whose `html`
  // is "{{#allEntries}}{{{summary}}}{{/allEntries}}". If a kept field holds
  // template tags we can't be sure the fields we're about to strip aren't
  // referenced from there, so leave that entry alone.
  var keep = HEAVY_FIELDS.filter(function (field) {
    return fields[field];
  });

  for (var i = 0; i < list.length; i++) {
    var entry = list[i];

    if (!entry || typeof entry !== "object") continue;

    if (keptFieldHasMustache(entry, keep)) continue;

    for (var j = 0; j < strip.length; j++) {
      if (entry[strip[j]] !== undefined) delete entry[strip[j]];
    }
  }

  return entries;
}

function keptFieldHasMustache(entry, keep) {
  for (var i = 0; i < keep.length; i++) {
    var value = entry[keep[i]];
    if (typeof value === "string" && value.indexOf("{{") !== -1) return true;
  }
  return false;
}

projectEntryFields.HEAVY_FIELDS = HEAVY_FIELDS;
projectEntryFields.resolveFields = resolveFields;

module.exports = projectEntryFields;
