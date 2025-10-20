const Entry = require("models/entry");
const Tags = require("models/tags");
const type = require("helper/type");
const _ = require("lodash");
const async = require("async");

function buildPagination(current, pageSize, totalEntries) {
  var totalPages = pageSize > 0 ? Math.ceil(totalEntries / pageSize) : 0;

  if (!totalEntries) {
    totalPages = 0;
  }

  var previous = current > 1 ? current - 1 : null;
  var next = totalPages > 0 && current < totalPages ? current + 1 : null;

  return {
    current,
    pageSize,
    total: totalPages,
    totalEntries: totalEntries,
    previous,
    next,
  };
}

function buildTagMetadata(prettyTags) {
  const filtered = (prettyTags || []).filter(Boolean);
  const label = filtered.join(" + ");
  const tagged = {};

  if (label) {
    tagged[label] = true;
    tagged[label.toLowerCase()] = true;
  }

  return {
    tag: label,
    tagged,
  };
}

function normalizeSlugs(slugs) {
  if (type(slugs, "array")) {
    return slugs.filter(Boolean).map(String);
  }

  if (type(slugs, "string")) {
    return [slugs];
  }

  throw new Error("Unexpected type of tag");
}

function sanitizePaginationOptions(options) {
  if (!options || options.limit === undefined) {
    return { hasPagination: false };
  }

  var parsedLimit = parseInt(options.limit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return { hasPagination: false };
  }

  var parsedOffset = parseInt(options.offset, 10);
  if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
    parsedOffset = 0;
  }

  return {
    hasPagination: true,
    limit: parsedLimit,
    offset: parsedOffset,
    currentPage: Math.floor(parsedOffset / parsedLimit) + 1,
  };
}

function attachPagination(metadata, paginationOptions) {
  if (!paginationOptions.hasPagination) {
    return metadata;
  }

  var totalEntries =
    metadata.total !== undefined
      ? metadata.total
      : (metadata.entryIDs || []).length;

  metadata.total = totalEntries;
  metadata.pagination = buildPagination(
    paginationOptions.currentPage,
    paginationOptions.limit,
    totalEntries
  );

  return metadata;
}

function fetchTaggedEntries(blogID, slugs, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};
  var paginationOptions = sanitizePaginationOptions(options);

  let normalizedSlugs;

  try {
    normalizedSlugs = normalizeSlugs(slugs);
  } catch (err) {
    return callback(err);
  }

  if (!normalizedSlugs.length) {
    return callback(null, attachPagination({
      entryIDs: [],
      total: options.limit !== undefined ? 0 : undefined,
      tag: "",
      tagged: {},
      prettyTags: [],
      slugs: [],
    }, paginationOptions));
  }

  if (normalizedSlugs.length === 1) {
    const slug = normalizedSlugs[0];

    return Tags.get(blogID, slug, options, function (err, entryIDs, prettyTag, total) {
      if (err) return callback(err);

      const metadata = buildTagMetadata([prettyTag || slug]);

      return callback(null, attachPagination({
        entryIDs: entryIDs || [],
        total: options.limit !== undefined ? total || 0 : undefined,
        tag: metadata.tag,
        tagged: metadata.tagged,
        prettyTags: [prettyTag || slug],
        slugs: normalizedSlugs,
      }, paginationOptions));
    });
  }

  async.mapSeries(
    normalizedSlugs,
    function (slug, next) {
      Tags.get(blogID, slug, function (err, entryIDs, prettyTag) {
        if (err) return next(err);

        next(null, {
          entryIDs: entryIDs || [],
          prettyTag: prettyTag || slug,
        });
      });
    },
    function (err, results) {
      if (err) return callback(err);

      const entryIDLists = results.map((result) => result.entryIDs || []);
      let entryIDs = [];

      if (entryIDLists.length) {
        entryIDs = _.intersection.apply(null, entryIDLists) || [];
      }

      const prettyTags = results.map((result) => result.prettyTag);
      const metadata = buildTagMetadata(prettyTags);

      if (paginationOptions.hasPagination) {
        const sliced = entryIDs.slice(
          paginationOptions.offset,
          paginationOptions.offset + paginationOptions.limit
        );

        return callback(null, attachPagination({
          entryIDs: sliced,
          total: entryIDs.length,
          tag: metadata.tag,
          tagged: metadata.tagged,
          prettyTags,
          slugs: normalizedSlugs,
        }, paginationOptions));
      }

      return callback(null, {
        entryIDs,
        total: undefined,
        tag: metadata.tag,
        tagged: metadata.tagged,
        prettyTags,
        slugs: normalizedSlugs,
      });
    }
  );
}

module.exports = function (req, callback) {
  var blog = req.blog;
  var blogID = blog.id;

  var tags = req.query.name || req.query.tag || req.params.tag || "";

  fetchTaggedEntries(blogID, tags, function (err, result) {
    if (err) return callback(err);

    Entry.get(blogID, result.entryIDs || [], function (entries) {
      entries.sort(function (a, b) {
        return b.dateStamp - a.dateStamp;
      });

      return callback(null, {
        tag: result.tag,
        tagged: result.tagged,
        is: result.tagged, // alias
        entries,
        pagination: result.pagination,
        total: result.total,
        slugs: result.slugs,
        prettyTags: result.prettyTags,
      });
    });
  });
};

module.exports.fetch = fetchTaggedEntries;
module.exports.buildPagination = buildPagination;
