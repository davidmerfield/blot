// Delete the legacy JSON string key for every entry once the Redis hash is in
// place (scripts/entry/backfill-hashes.js) and app/models/entry has been
// reading from the hash in production long enough to be trusted.
//
// For each entry tracked in blog:<id>:all it checks that the hash key exists
// and only then deletes the string key. An entry with no hash is left alone
// and reported, so a half-finished backfill can never lose data.
//
//   node scripts/entry/purge-entry-strings.js --dry-run   # report only
//   node scripts/entry/purge-entry-strings.js             # actually delete
//   node scripts/entry/purge-entry-strings.js -o BLOGID   # one blog
//
// (-o / -s / -e / -r / -p are handled by scripts/each/blog.js.)

var async = require("async");
var redis = require("models/client");
var eachBlog = require("../each/blog");
var Entries = require("models/entries");
var key = require("models/entry").key;
var options = require("minimist")(process.argv.slice(2));

var DRY_RUN = options["dry-run"] === true || options.n === true;
var CONCURRENCY = 20;

var totals = {
  blogs: 0,
  entries: 0,
  deleted: 0,
  wouldDelete: 0,
  hashMissing: 0,
  alreadyGone: 0,
  errors: 0,
};

function purgeBlog(user, blog, nextBlog) {
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

        Promise.all([redis.exists(stringKey), redis.exists(hashKey)])
          .then(function (results) {
            var stringExists = Number(results[0]) >= 1;
            var hashExists = Number(results[1]) >= 1;

            if (!stringExists) {
              totals.alreadyGone++;
              return nextEntry();
            }

            if (!hashExists) {
              totals.hashMissing++;
              console.warn(
                blog.id,
                entryID,
                "has no hash - run backfill-hashes.js first; skipping"
              );
              return nextEntry();
            }

            if (DRY_RUN) {
              totals.wouldDelete++;
              return nextEntry();
            }

            return redis.del(stringKey).then(function () {
              totals.deleted++;
              if (totals.deleted % 1000 === 0) {
                console.log("... deleted", totals.deleted, "string keys");
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
  purgeBlog,
  function () {
    console.log(DRY_RUN ? "Purge dry run complete:" : "Purge complete:");
    console.log(JSON.stringify(totals, null, 2));
    process.exit(totals.errors || totals.hashMissing ? 1 : 0);
  },
  options
);
