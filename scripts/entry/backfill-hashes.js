// Backfill the Redis hash representation of every entry from the authoritative
// JSON string key.
//
// Entries written after the dual-write change (app/models/entry/set.js) already
// have both representations. This script fills in the hash for every entry that
// predates the change so the JSON string keys can eventually be purged
// (scripts/entry/purge-entry-strings.js).
//
// ORDERING: run this only once the new build is fully rolled out to every app
// instance. An old instance (pre-dual-write) updates only the JSON string, so
// if it writes an entry after this script has created that entry's hash, the
// hash goes stale and hash-first reads (models/entry/get.js) would serve it.
// The same applies to purge-entry-strings.js.
//
// It is safe to run repeatedly and while the (new) app is live: each entry's
// hash is only ever *created when absent*, never overwritten. The check and the
// write are made atomic with WATCH on the hash key - a concurrent Entry.set
// (which writes the hash inside its own MULTI) trips the WATCH, exec throws a
// WatchError, and the retry then sees the hash and skips it. Because WATCH is
// connection-global on the shared client, entries are processed strictly one at
// a time.
//
//   node scripts/entry/backfill-hashes.js            # every blog
//   node scripts/entry/backfill-hashes.js -o BLOGID  # one blog
//   node scripts/entry/backfill-hashes.js -s 500     # resume from blog #500
//
// (-o / -s / -e / -r are handled by scripts/each/blog.js. -p / parallel is
// forced off here because WATCH is connection-global.)

var async = require("async");
var redis = require("models/client");
var WatchError = require("redis").WatchError;
var eachBlog = require("../each/blog");
var Entries = require("models/entries");
var entryModel = require("models/entry");
var key = entryModel.key;
var format = entryModel.format;
var options = require("minimist")(process.argv.slice(2));

var MAX_ATTEMPTS = 5;

var totals = {
  blogs: 0,
  entries: 0,
  backfilled: 0,
  alreadyHadHash: 0,
  missingString: 0,
  retries: 0,
  errors: 0,
};

// Create the hash for one entry iff it does not exist yet, without ever
// clobbering a concurrent Entry.set. Resolves to one of:
//   "ok" | "hash-present" | "no-string" | "parse-error" | "retry"
async function backfillOne(stringKey, hashKey) {
  await redis.watch(hashKey);

  try {
    if (Number(await redis.exists(hashKey)) >= 1) {
      await redis.unwatch();
      return "hash-present";
    }

    var raw = await redis.get(stringKey);

    if (raw === null || raw === undefined) {
      await redis.unwatch();
      return "no-string";
    }

    var entry;
    try {
      entry = JSON.parse(raw);
    } catch (e) {
      await redis.unwatch();
      return "parse-error";
    }

    var ttl = await redis.pTTL(stringKey);

    var multi = redis.multi().hSet(hashKey, format.serialize(entry));
    if (typeof ttl === "number" && ttl > 0) multi.pExpire(hashKey, ttl);

    await multi.exec(); // throws WatchError if hashKey changed under us
    return "ok";
  } catch (e) {
    // Make sure a failed attempt never leaves the shared connection watching.
    try {
      await redis.unwatch();
    } catch (ignored) {}

    if (e instanceof WatchError) return "retry";
    throw e;
  }
}

function backfillEntry(blogID, entryID, done) {
  totals.entries++;

  var stringKey = key.entry(blogID, entryID);
  var hashKey = key.entryHash(blogID, entryID);
  var attempts = 0;

  function attempt() {
    attempts++;

    backfillOne(stringKey, hashKey)
      .then(function (outcome) {
        if (outcome === "retry") {
          totals.retries++;
          if (attempts >= MAX_ATTEMPTS) {
            totals.errors++;
            console.error(blogID, entryID, "gave up after", attempts, "attempts");
            return done();
          }
          return attempt();
        }

        if (outcome === "ok") {
          totals.backfilled++;
          if (totals.backfilled % 1000 === 0) {
            console.log("... backfilled", totals.backfilled, "entries");
          }
        } else if (outcome === "hash-present") {
          totals.alreadyHadHash++;
        } else if (outcome === "no-string") {
          totals.missingString++;
        } else if (outcome === "parse-error") {
          totals.errors++;
          console.error(blogID, entryID, "JSON parse failed");
        }

        done();
      })
      .catch(function (e) {
        totals.errors++;
        console.error(blogID, entryID, e.message || e);
        done();
      });
  }

  attempt();
}

function backfillBlog(user, blog, nextBlog) {
  totals.blogs++;

  Entries.getAllIDs(blog.id, function (err, ids) {
    if (err) {
      totals.errors++;
      console.error(blog.id, "getAllIDs failed:", err.message || err);
      return nextBlog();
    }

    // Strictly serial: WATCH state is shared across the whole connection.
    async.eachSeries(
      ids || [],
      function (entryID, nextEntry) {
        backfillEntry(blog.id, entryID, nextEntry);
      },
      nextBlog
    );
  });
}

// WATCH is connection-global on the shared client, so blogs must run serially.
delete options.p;

eachBlog(
  backfillBlog,
  function () {
    console.log("Backfill complete:");
    console.log(JSON.stringify(totals, null, 2));
    process.exit(totals.errors ? 1 : 0);
  },
  options
);
