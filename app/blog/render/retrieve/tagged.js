const Entry = require("models/entry");
const Tags = require("models/tags");

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

function fetchTaggedEntries(blogID, slugs, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};

  const pg = parsePaginationOptions(options);

  let normalized;
  try {
    normalized = normalizeSlugs(slugs);
  } catch (e) {
    return callback(e);
  }

  if (!normalized.length) {
    return callback(
      null,
      attachPagination(
        {
          entryIDs: [],
          total: options.limit !== undefined ? 0 : undefined,
          tag: "",
          tagged: {},
          prettyTags: [],
          slugs: [],
        },
        pg
      )
    );
  }

  if (normalized.length === 1) {
    const slug = normalized[0];
    return getTag(blogID, slug, options)
      .then(({ entryIDs, prettyTag, total }) => {
        const meta = buildTagMetadata([prettyTag]);
        return callback(
          null,
          attachPagination(
            {
              entryIDs,
              total: options.limit !== undefined ? total || 0 : undefined,
              tag: meta.tag,
              tagged: meta.tagged,
              prettyTags: [prettyTag],
              slugs: normalized,
            },
            pg
          )
        );
      })
      .catch(callback);
  }

  // Multiple tags: fetch without pagination options, then intersect and slice locally
  Promise.all(normalized.map((slug) => getTag(blogID, slug)))
    .then((results) => {
      const lists = results.map((r) => r.entryIDs || []);
      const entryIDs = intersectMany(lists);
      const prettyTags = results.map((r) => r.prettyTag);
      const meta = buildTagMetadata(prettyTags);

      if (pg.hasPagination) {
        const sliced = entryIDs.slice(pg.offset, pg.offset + pg.limit);
        return callback(
          null,
          attachPagination(
            {
              entryIDs: sliced,
              total: entryIDs.length,
              tag: meta.tag,
              tagged: meta.tagged,
              prettyTags,
              slugs: normalized,
            },
            pg
          )
        );
      }

      return callback(null, {
        entryIDs,
        total: undefined,
        tag: meta.tag,
        tagged: meta.tagged,
        prettyTags,
        slugs: normalized,
      });
    })
    .catch(callback);
}

module.exports = function (req, res, callback) {
  const blogID = req.blog.id;
  const tags =
    req.query.name ||
    req.query.tag ||
    req.params.tag ||
    (res.locals && res.locals.tag) ||
    "";

  let page = parseInt(req.params.page, 10);
  if (!page || page < 1) page = 1;

  const templateLocals = (req.template && req.template.locals) || {};

  let preferredLimit;

  if (templateLocals.tagged_page_size !== undefined) {
    preferredLimit = templateLocals.tagged_page_size;
  } else {
    preferredLimit = templateLocals.page_size;
  }

  let limit = parseInt(preferredLimit, 10);
  if (!Number.isFinite(limit)) limit = undefined;

  if (!limit || limit < 1 || limit > 500) limit = 100;

  const offset = (page - 1) * limit;

  fetchTaggedEntries(blogID, tags, { limit, offset }, function (err, result) {
    if (err) return callback(err);

    Entry.get(blogID, result.entryIDs || [], function (entries) {
      entries.sort((a, b) => b.dateStamp - a.dateStamp);

      const totalEntries =
        result.total !== undefined
          ? result.total
          : (result.entryIDs || []).length;

      res.locals.pagination = result.pagination || {};

      callback(null, {
        tag: result.tag,
        tagged: result.tagged,
        is: result.tagged, // alias
        entries,
        pagination: result.pagination,
        total: totalEntries,
        entryIDs: result.entryIDs || [],
        slugs: result.slugs,
        prettyTags: result.prettyTags,
      });
    });
  });
};
