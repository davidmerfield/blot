var ensure = require("helper/ensure");
var redis = require("models/client");

function entriesKey(blogID) {
  return "blog:" + blogID + ":entries";
}

function lexKey(blogID) {
  return "blog:" + blogID + ":entries:lex";
}

function readyKey(blogID) {
  return "blog:" + blogID + ":entries:lex:ready";
}

function backfillIndex(blogID, callback) {
  redis.zrange(entriesKey(blogID), 0, -1, function (err, ids) {
    if (err) return callback(err);

    var multi = redis.multi();

    multi.del(lexKey(blogID));

    if (ids && ids.length) {
      for (var i = 0; i < ids.length; i++) {
        multi.zadd(lexKey(blogID), 0, ids[i]);
      }
    }

    multi.set(readyKey(blogID), "1");

    multi.exec(function (err) {
      if (err) return callback(err);
      callback(null, ids ? ids.length : 0);
    });
  });
}

function ensureIndex(blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  redis.exists(readyKey(blogID), function (err, ready) {
    if (err) return callback(err);
    if (ready) return callback();
    callback(new Error("Entries path index is not ready for blog " + blogID));
  });
}

module.exports = {
  lexKey: lexKey,
  readyKey: readyKey,
  ensureIndex: ensureIndex,
  backfillIndex: backfillIndex,
};
