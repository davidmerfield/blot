const Tags = require("models/tags");
const {
  normalizePathPrefix,
  filterEntryIDsByPathPrefix,
} = require("helper/pathPrefix");

function buildPagination(current, pageSize, totalEntries) {
  const total = pageSize > 0 ? Math.ceil(totalEntries / pageSize) : 0;
  const previous = current > 1 ? current - 1 : null;
  const next = total > 0 && current < total ? current + 1 : null;
  return {
    current,
    pageSize,
    page_size: pageSize,
    total,
    totalEntries,
    // Prefer snake_case in public payloads; keep camelCase for legacy compatibility.
    total_entries: totalEntries,
    previous,
    next,
  };
}

function buildTagMetadata(prettyTags) {
  const label = (prettyTags || []).filter(Boolean).join(" + ");
  const tagged = {};
  if (label) {
    tagged[label] = true;
    tagged[label.toLowerCase()] = true;
  }
  return { tag: label, tagged };
}

function normalizeSlugs(slugs) {
  if (Array.isArray(slugs)) return slugs.filter(Boolean).map(String);
  if (typeof slugs === "string") return [slugs];
  throw new Error("Unexpected type of tag");
}

function parsePaginationOptions(options) {
  if (!options || options.limit === undefined) return { hasPagination: false };
  const limit = parseInt(options.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) return { hasPagination: false };
  let offset = parseInt(options.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return {
    hasPagination: true,
    limit,
    offset,
    currentPage: Math.floor(offset / limit) + 1,
  };
}

function attachPagination(meta, pg) {
  if (!pg.hasPagination) return meta;
  const totalEntries =
    meta.total !== undefined ? meta.total : (meta.entryIDs || []).length;
  meta.total = totalEntries;
  meta.pagination = buildPagination(pg.currentPage, pg.limit, totalEntries);
  return meta;
}

function buildTaggedResult({ entryIDs, total, prettyTags, slugs, pg }) {
  const metadata = buildTagMetadata(prettyTags);
  const result = {
    entryIDs,
    tag: metadata.tag,
    tagged: metadata.tagged,
    prettyTags,
    slugs,
  };

  if (total !== undefined) {
    result.total = total;
  }

  return attachPagination(result, pg);
}

function buildSingleTagResult({ entryIDs, prettyTag, slugs, pg, total }) {
  return buildTaggedResult({
    entryIDs,
    total,
    prettyTags: [prettyTag],
    slugs,
    pg,
  });
}

function buildMultiTagResult({ entryIDs, prettyTags, slugs, pg, total }) {
  return buildTaggedResult({
    entryIDs,
    total,
    prettyTags,
    slugs,
    pg,
  });
}

function applyPathPrefixFiltering(entryIDs, pathPrefix) {
  return filterEntryIDsByPathPrefix(entryIDs || [], pathPrefix);
}

function intersectMany(arrays) {
  if (!arrays.length) return [];
  let set = new Set(arrays[0]);
  for (let i = 1; i < arrays.length; i++) {
    const nextSet = new Set(arrays[i]);
    set = new Set([...set].filter((x) => nextSet.has(x)));
    if (!set.size) break;
  }
  return [...set];
}

// Tagged entry IDs come back newest-first (the sorted set is scored by
// dateStamp and read with REV). That matches the dashboard's default
// "Publish date - Newest first" selection (sort_by "date", order "asc").
function isDefaultTaggedOrder(sortBy, order) {
  const by = sortBy || "date";
  const direction = order || "asc";
  return by === "date" && direction === "asc";
}

// Order a full list of tagged entry IDs to match a dashboard sort selection.
// The incoming list is already newest-first by dateStamp.
function orderTaggedEntryIDs(entryIDs, sortBy, order) {
  const ids = (entryIDs || []).slice();
  const by = sortBy || "date";
  const direction = order || "asc";

  if (by === "id") {
    // Entry IDs are lowercased paths; sort lexicographically like models/entries.
    ids.sort();
    if (direction === "desc") ids.reverse();
    return ids;
  }

  // Date sorting: "asc" keeps newest-first, "desc" flips to oldest-first.
  if (direction === "desc") ids.reverse();
  return ids;
}

function getTag(blogID, slug, opts) {
  return new Promise((resolve, reject) => {
    // Tags.get may accept options for single-tag queries
    const cb = (err, entryIDs, prettyTag, total) =>
      err
        ? reject(err)
        : resolve({
            entryIDs: entryIDs || [],
            prettyTag: prettyTag || slug,
            total,
          });
    opts ? Tags.get(blogID, slug, opts, cb) : Tags.get(blogID, slug, cb);
  });
}

async function fetchTaggedEntriesInternal(blogID, slugs, options) {
  options = options || {};

  const pg = parsePaginationOptions(options);
  const normalized = normalizeSlugs(slugs);
  const pathPrefix = normalizePathPrefix(options.pathPrefix);
  const sortBy = options.sortBy;
  const order = options.order;
  const defaultOrder = isDefaultTaggedOrder(sortBy, order);

  if (!normalized.length) {
    return buildMultiTagResult({
      entryIDs: [],
      total: pg.hasPagination ? 0 : undefined,
      prettyTags: [],
      slugs: [],
      pg,
    });
  }

  if (normalized.length === 1) {
    const slug = normalized[0];
    // Redis can only paginate in its own (newest-first) order. For any other
    // dashboard selection we must pull the whole list and order it ourselves
    // before slicing, otherwise pagination picks the wrong entries.
    const canPageInRedis = !pathPrefix && pg.hasPagination && defaultOrder;
    const tagOptions = canPageInRedis
      ? { limit: pg.limit, offset: pg.offset }
      : undefined;
    const { entryIDs, prettyTag, total } = await getTag(blogID, slug, tagOptions);
    const filteredEntryIDs = applyPathPrefixFiltering(entryIDs, pathPrefix);
    const filteredTotal = filteredEntryIDs.length;

    let finalEntryIDs;
    if (canPageInRedis) {
      finalEntryIDs = filteredEntryIDs;
    } else {
      const orderedEntryIDs = orderTaggedEntryIDs(filteredEntryIDs, sortBy, order);
      finalEntryIDs = pg.hasPagination
        ? orderedEntryIDs.slice(pg.offset, pg.offset + pg.limit)
        : orderedEntryIDs;
    }

    const finalTotal = pathPrefix
      ? filteredTotal
      : (total !== undefined ? total : filteredTotal);

    return buildSingleTagResult({
      entryIDs: finalEntryIDs,
      total: finalTotal,
      prettyTag,
      slugs: normalized,
      pg,
    });
  }

  // Multiple tags: fetch without pagination options, then intersect and slice locally
  const results = await Promise.all(normalized.map((slug) => getTag(blogID, slug)));
  const lists = results.map((result) => result.entryIDs || []);
  const intersectedEntryIDs = intersectMany(lists);
  const prettyTags = results.map((result) => result.prettyTag);
  const filteredEntryIDs = applyPathPrefixFiltering(intersectedEntryIDs, pathPrefix);
  const orderedEntryIDs = orderTaggedEntryIDs(filteredEntryIDs, sortBy, order);
  const finalEntryIDs = pg.hasPagination
    ? orderedEntryIDs.slice(pg.offset, pg.offset + pg.limit)
    : orderedEntryIDs;

  return buildMultiTagResult({
    entryIDs: finalEntryIDs,
    total: pg.hasPagination ? filteredEntryIDs.length : undefined,
    prettyTags,
    slugs: normalized,
    pg,
  });
}

module.exports = function fetchTaggedEntries(blogID, slugs, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  return fetchTaggedEntriesInternal(blogID, slugs, options)
    .then((result) => callback(null, result))
    .catch(callback);
};
