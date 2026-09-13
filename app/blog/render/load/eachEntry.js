const type = require("helper/type");
const Entry = require("models/entry/instance");
const list = require("./list");

// Retrieve locals that hold entries (or trees of entries, e.g. archives).
// When we first see one of these keys we remember it as the owning local so
// augment can hydrate backlinks only for lists that actually render them.
const ENTRY_OWNING_LOCALS = {
  allEntries: true,
  all_entries: true,
  recentEntries: true,
  recent_entries: true,
  latestEntry: true,
  latest_entry: true,
  posts: true,
  search_results: true,
  tagged: true,
  archives: true,
  entries: true,
  entry: true,
};

module.exports = async function eachEntry(locals, iterator) {
  const entries = [];

  extractEntriesFromView(locals);

  await Promise.all(
    entries.map(async ({ entry, owningLocal }) => {
      const queue = [iterator(entry, owningLocal)];

      if (entry.next instanceof Entry)
        queue.push(iterator(entry.next, owningLocal));
      if (entry.previous instanceof Entry)
        queue.push(iterator(entry.previous, owningLocal));

      await Promise.all(queue);
    })
  );

  function extractEntriesFromView(obj, depth = 0, owningLocal = null) {
    for (const key in obj) {
      const local = obj[key];

      // Partials never contain an entry
      if (key === "partials" && depth === 0) {
        continue;
      }

      // Once we enter a retrieve local (archives, posts, ...), nested keys
      // like archives.months.entries keep that owner instead of becoming
      // a new "entries" local.
      const nextOwning =
        owningLocal || (ENTRY_OWNING_LOCALS[key] ? key : null);

      // This is an entry, modify it now and proceed!
      if (local instanceof Entry) {
        entries.push({ entry: local, owningLocal: nextOwning || key });
        continue;
      }

      // This is a list (not neccessarily of entries)
      // so add the needed properties to it, e.g. 'first'.
      if (type(local, "array")) {
        list(local);
      }

      // This is a list of entries so modify each and proceed
      // We assume that if the first item in the list is an
      // entry then the rest is too. This could be dumb.
      if (type(local, "array") && local[0] instanceof Entry) {
        for (const entry of local) {
          entries.push({ entry, owningLocal: nextOwning || key });
        }
        continue;
      }

      // Proceed down the tree!
      if (type(local, "object") || type(local, "array")) {
        extractEntriesFromView(local, depth + 1, nextOwning);
      }
    }
  }
};
