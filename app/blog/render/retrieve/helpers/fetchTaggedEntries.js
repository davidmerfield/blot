const Tags = require("models/tags");
const {
  normalizePathPrefix,
  filterEntryIDsByPathPrefix,
} = require("helper/pathPrefix");

function buildPagination(current, pageSize, totalEntries) {
  const total = pageSize > 0 ? Math.ceil(totalEntries / pageSize) : 0;
  const previous = current > 1 ? current - 1 : null;
  const next = total > 0 && current < total ? current + 1 : null;
  return { current, pageSize, total, totalEntries, previous, next };
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
    const tagOptions = !pathPrefix && pg.hasPagination
      ? { limit: pg.limit, offset: pg.offset }
      : undefined;
    const { entryIDs, prettyTag, total } = await getTag(blogID, slug, tagOptions);
    const filteredEntryIDs = applyPathPrefixFiltering(entryIDs, pathPrefix);
    const filteredTotal = filteredEntryIDs.length;
    const finalEntryIDs = pathPrefix && pg.hasPagination
      ? filteredEntryIDs.slice(pg.offset, pg.offset + pg.limit)
      : filteredEntryIDs;
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
  const finalEntryIDs = pg.hasPagination
    ? filteredEntryIDs.slice(pg.offset, pg.offset + pg.limit)
    : filteredEntryIDs;

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
