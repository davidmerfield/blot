var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var bucket = require("./_bucket");

// Atomically remove a now-possibly-empty bucket from the months index, but
// only if it is still empty by the time this runs. A plain ZCARD-then-ZREM
// from JS is a check-then-act race: a concurrent set() adding a new entry to
// the same month between the check and the removal would have its bucket
// membership silently dropped from "months" until a later rebuild. Run
// server-side in one atomic step instead.
var pruneIfEmpty = `
  if redis.call('ZCARD', KEYS[1]) == 0 then
    redis.call('ZREM', KEYS[2], ARGV[1])
  end
  return 1
`;

// Keeps the precomputed year/month archives index for one entry in sync.
// Called alongside models/tags' set() from app/models/entry/set.js's save
// queue. Unlike tags (whose sorted-set key is the stable tag name), an
// archive bucket's key is derived from dateStamp, so a dateStamp edit that
// crosses a month boundary has to move the entry between two sorted sets -
// key.entry(blogID, entry.id) remembers which bucket an entry is currently
// in so we know what to remove it from.
module.exports = function (blogID, entry, timeZone, callback) {
  ensure(blogID, "string").and(timeZone, "string").and(callback, "function");

  var entryKey = key.entry(blogID, entry.id);
  var isVisible = bucket.visible(entry);
  var newBucket = isVisible
    ? bucket.yearMonth(entry.dateStamp, timeZone)
    : null;

  (async function () {
    var oldBucket = await client.get(entryKey);

    var multi = client.multi();
    var bucketChanged = oldBucket && oldBucket !== newBucket;

    if (bucketChanged) {
      multi.zRem(key.bucket(blogID, oldBucket), entry.id);
    }

    if (isVisible) {
      multi.zAdd(key.bucket(blogID, newBucket), {
        score: entry.dateStamp,
        value: entry.id,
      });
      multi.zAdd(key.months(blogID), {
        score: bucket.score(newBucket),
        value: newBucket,
      });
      multi.set(entryKey, newBucket);
    } else if (oldBucket) {
      multi.del(entryKey);
    }

    // A rebuild in progress (models/archives/rebuild.js) watches this
    // counter to detect a concurrent save and retry from a fresh snapshot
    // rather than overwrite it with stale data. Bump it inside the same
    // transaction as the actual index change so a rebuild can never observe
    // a generation bump without the write it corresponds to (or vice versa).
    multi.incr(key.generation(blogID));

    await multi.exec();

    // Prune a month from the index once its last entry has moved out or
    // been hidden. Done as a follow-up call rather than inside the multi
    // above, since bucket membership count isn't the "months" sorted set's
    // score (unlike tags' popularity count, which prunes in the same multi).
    if (bucketChanged || (!isVisible && oldBucket)) {
      await client.eval(pruneIfEmpty, {
        keys: [key.bucket(blogID, oldBucket), key.months(blogID)],
        arguments: [oldBucket],
      });
    }

    callback();
  })().catch(function (err) {
    callback(err);
  });
};
