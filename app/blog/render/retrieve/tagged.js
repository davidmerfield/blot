const Entry = require("models/entry");
const Tags = require("models/tags");
const type = require("helper/type");
const _ = require("lodash");
const async = require("async");

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

function fetchTaggedEntries(blogID, slugs, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  let normalizedSlugs;

  try {
    normalizedSlugs = normalizeSlugs(slugs);
  } catch (err) {
    return callback(err);
  }

  if (!normalizedSlugs.length) {
    return callback(null, {
      entryIDs: [],
      total: options.limit !== undefined ? 0 : undefined,
      tag: "",
      tagged: {},
      prettyTags: [],
      slugs: [],
    });
  }

  if (normalizedSlugs.length === 1) {
    const slug = normalizedSlugs[0];

    return Tags.get(blogID, slug, options, function (err, entryIDs, prettyTag, total) {
      if (err) return callback(err);

      const metadata = buildTagMetadata([prettyTag || slug]);

      return callback(null, {
        entryIDs: entryIDs || [],
        total: options.limit !== undefined ? total || 0 : undefined,
        tag: metadata.tag,
        tagged: metadata.tagged,
        prettyTags: [prettyTag || slug],
        slugs: normalizedSlugs,
      });
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

      return callback(null, {
        entryIDs,
        total:
          options && options.limit !== undefined ? entryIDs.length : undefined,
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
      });
    });
  });
};

module.exports.fetch = fetchTaggedEntries;
