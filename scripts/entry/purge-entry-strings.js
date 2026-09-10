// Expire the legacy JSON string key for every entry, now that the Redis hash
// is the source of truth (config.redis.readEntriesFromHash) and set.js has
// stopped writing the string.
//
// It sets a TTL (default 7 days) rather than deleting outright, so:
//   - models/entry/get's per-read string fallback keeps working during the
//     grace window for any entry whose hash turns out to be missing;
//   - aborting is `redis PERSIST` over the keyspace within the window.
//
// For each entry tracked in blog:<id>:all it only ever touches the string
// when a hash exists and the string has no TTL yet. An entry with no hash is
// left alone and reported, so a half-finished backfill can never lose data.
// Re-runs are no-ops for keys already expiring.
//
//   node scripts/entry/purge-entry-strings.js --dry-run       # report only
//   node scripts/entry/purge-entry-strings.js                 # set the TTL
//   node scripts/entry/purge-entry-strings.js --days 14       # longer grace
//   node scripts/entry/purge-entry-strings.js -o BLOGID       # one blog
//
// (-o / -s / -e / -r / -p / -c are handled by scripts/each/blog.js. PEXPIRE
// is atomic and independent per key, so concurrency is safe here.)

var async = require("async");
var config = require("config");
var redis = require("models/client");
var eachBlog = require("../each/blog");
var Blog = require("models/blog");
var Entries = require("models/entries");
var key = require("models/entry").key;
var options = require("minimist")(process.argv.slice(2));

var DRY_RUN = options["dry-run"] === true || options.n === true;
var GRACE_DAYS = parseInt(options.days, 10) > 0 ? parseInt(options.days, 10) : 7;
var GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;
var CONCURRENCY = 25;

if (!DRY_RUN && !config.redis.readEntriesFromHash) {
  console.error(
    "Refusing to run: config.redis.readEntriesFromHash is off, so reads still " +
      "depend on the JSON string keys. Enable hash reads everywhere first, or " +
      "pass --dry-run."
  );
  process.exit(1);
}

var totals = {
  blogs: 0,
  entries: 0,
  expired: 0,
  wouldExpire: 0,
  alreadyExpiring: 0,
  stringGone: 0,
  hashMissing: 0,
  errors: 0,
};

function purgeEntry(blogID, entryID, done) {
  totals.entries++;

  var stringKey = key.entry(blogID, entryID);
  var hashKey = key.entryHash(blogID, entryID);

  Promise.all([
    redis.exists(stringKey),
    redis.exists(hashKey),
    redis.pTTL(stringKey),
  ])
    .then(function (results) {
      var stringExists = Number(results[0]) >= 1;
      var hashExists = Number(results[1]) >= 1;
      var ttl = results[2];

      if (!stringExists) {
        totals.stringGone++;
        return done();
      }

      if (!hashExists) {
        totals.hashMissing++;
        console.warn(
          blogID,
          entryID,
          "string key has no hash - run backfill-hashes.js first; leaving it"
        );
        return done();
      }

      // ttl >= 0 means a TTL is already set (a prior run, or a deleted-entry
      // tombstone). -1 means it lives forever - that's what we want to bound.
      if (typeof ttl === "number" && ttl >= 0) {
        totals.alreadyExpiring++;
        return done();
      }

      if (DRY_RUN) {
        totals.wouldExpire++;
        return done();
      }

      return redis.pExpire(stringKey, GRACE_MS).then(function () {
        totals.expired++;
        if (totals.expired % 1000 === 0) {
          console.log("... set TTL on", totals.expired, "string keys");
        }
        done();
      });
    })
    .catch(function (e) {
      totals.errors++;
      console.error(blogID, entryID, e.message || e);
      done();
    });
}

function purgeBlog(user, blog, nextBlog) {
  totals.blogs++;

  Entries.getAllIDs(blog.id, function (err, ids) {
    if (err) {
      totals.errors++;
      console.error(blog.id, "getAllIDs failed:", err.message || err);
      return nextBlog();
    }

    async.eachLimit(
      ids || [],
      CONCURRENCY,
      function (entryID, nextEntry) {
        purgeEntry(blog.id, entryID, nextEntry);
      },
      nextBlog
    );
  });
}

function finish(expectedBlogCount) {
  console.log(
    (DRY_RUN ? "Purge dry run" : "Purge (" + GRACE_DAYS + "-day TTL)") +
      " finished:"
  );
  console.log(JSON.stringify(totals, null, 2));

  var incomplete = false;

  if (typeof expectedBlogCount === "number" && totals.blogs < expectedBlogCount) {
    incomplete = true;
    console.error(
      "WARNING: processed " +
        totals.blogs +
        " of " +
        expectedBlogCount +
        " blogs. " +
        (expectedBlogCount - totals.blogs) +
        " were skipped (blog or owner record missing / unreadable)."
    );
  }

  if (totals.hashMissing) {
    console.error(
      "WARNING: " +
        totals.hashMissing +
        " string keys have no hash and were left untouched. Re-run " +
        "backfill-hashes.js and verify before purging again."
    );
  }

  process.exit(totals.errors || totals.hashMissing || incomplete ? 1 : 0);
}

eachBlog(
  purgeBlog,
  function () {
    if (options.o || options.s || options.e) return finish(null);
    Blog.getAllIDs(function (err, ids) {
      finish(err || !ids ? null : ids.length);
    });
  },
  options
);
