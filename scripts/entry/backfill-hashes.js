// Backfill the Redis hash representation of every entry from the authoritative
// JSON string key.
//
// Entries written after the dual-write change (app/models/entry/set.js) already
// have both representations. This script fills in the hash for every entry that
// predates the change so the JSON string keys can eventually be purged
// (scripts/entry/purge-entry-strings.js).
//
// It is safe to run repeatedly and while the app is live: each entry's hash is
// rewritten in a MULTI (DEL + HSET, plus PEXPIRE to match the string key's
// remaining TTL for deleted-entry tombstones), so a concurrent Entry.set just
// wins the race harmlessly.
//
//   node scripts/entry/backfill-hashes.js            # every blog
//   node scripts/entry/backfill-hashes.js -o BLOGID  # one blog
//   node scripts/entry/backfill-hashes.js -s 500     # resume from blog #500
//
// (-o / -s / -e / -r / -p are handled by scripts/each/blog.js.)

var async = require("async");
var redis = require("models/client");
var eachBlog = require("../each/blog");
var Entries = require("models/entries");
var entryModel = require("models/entry");
var key = entryModel.key;
var format = entryModel.format;
var options = require("minimist")(process.argv.slice(2));

var CONCURRENCY = 20;

var totals = {
  blogs: 0,
  entries: 0,
  backfilled: 0,
  missingString: 0,
  errors: 0,
};

function backfillBlog(user, blog, nextBlog) {
  totals.blogs++;

  Entries.getAllIDs(blog.id, function (err, ids) {
    if (err) {
      totals.errors++;
      console.error(blog.id, "getAllIDs failed:", err.message || err);
      return nextBlog();
    }

    ids = ids || [];

    async.eachLimit(
      ids,
      CONCURRENCY,
      function (entryID, nextEntry) {
        totals.entries++;

        var stringKey = key.entry(blog.id, entryID);
        var hashKey = key.entryHash(blog.id, entryID);

        redis
          .get(stringKey)
          .then(function (raw) {
            if (raw === null || raw === undefined) {
              totals.missingString++;
              return nextEntry();
            }

            var entry;

            try {
              entry = JSON.parse(raw);
            } catch (e) {
              totals.errors++;
              console.error(
                blog.id,
                entryID,
                "JSON parse failed:",
                e.message
              );
              return nextEntry();
            }

            return redis
              .pTTL(stringKey)
              .then(function (ttl) {
                var multi = redis
                  .multi()
                  .del(hashKey)
                  .hSet(hashKey, format.serialize(entry));

                if (typeof ttl === "number" && ttl > 0) {
                  multi.pExpire(hashKey, ttl);
                }

                return multi.exec();
              })
              .then(function () {
                totals.backfilled++;
                if (totals.backfilled % 1000 === 0) {
                  console.log("... backfilled", totals.backfilled, "entries");
                }
                nextEntry();
              });
          })
          .catch(function (e) {
            totals.errors++;
            console.error(blog.id, entryID, e.message || e);
            nextEntry();
          });
      },
      nextBlog
    );
  });
}

eachBlog(
  backfillBlog,
  function () {
    console.log("Backfill complete:");
    console.log(JSON.stringify(totals, null, 2));
    process.exit(totals.errors ? 1 : 0);
  },
  options
);
