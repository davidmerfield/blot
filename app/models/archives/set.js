var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var bucket = require("./_bucket");

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

    await multi.exec();

    // Prune a month from the index once its last entry has moved out or
    // been hidden. Done as a follow-up read rather than inside the multi
    // above, since bucket membership count isn't the "months" sorted set's
    // score (unlike tags' popularity count, which prunes in the same multi).
    if (bucketChanged || (!isVisible && oldBucket)) {
      var remaining = await client.zCard(key.bucket(blogID, oldBucket));
      if (!remaining) await client.zRem(key.months(blogID), oldBucket);
    }

    callback();
  })().catch(function (err) {
    callback(err);
  });
};
