var ensure = require("helper/ensure");
var redis = require("models/client");

var LOCK_TTL_SECONDS = 30;
var WAIT_RETRIES = 8;
var WAIT_DELAY_MS = 50;

function entriesKey(blogID) {
  return "blog:" + blogID + ":entries";
}

function lexKey(blogID) {
  return "blog:" + blogID + ":entries:lex";
}

function readyKey(blogID) {
  return "blog:" + blogID + ":entries:lex:ready";
}

function lockKey(blogID) {
  return "blog:" + blogID + ":entries:lex:backfill:lock";
}

function waitForReady(blogID, retries, callback) {
  if (retries <= 0) return callback();

  setTimeout(function () {
    redis.exists(readyKey(blogID), function (err, ready) {
      if (err) return callback(err);
      if (ready) return callback();
      waitForReady(blogID, retries - 1, callback);
    });
  }, WAIT_DELAY_MS);
}

function backfill(blogID, callback) {
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
    multi.del(lockKey(blogID));

    multi.exec(function (err) {
      if (err) return callback(err);
      callback();
    });
  });
}

function ensureIndex(blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  redis.exists(readyKey(blogID), function (err, ready) {
    if (err) return callback(err);
    if (ready) return callback();

    redis.set(
      lockKey(blogID),
      "1",
      "NX",
      "EX",
      LOCK_TTL_SECONDS,
      function (err, locked) {
        if (err) return callback(err);

        if (!locked) {
          return waitForReady(blogID, WAIT_RETRIES, callback);
        }

        backfill(blogID, callback);
      }
    );
  });
}

module.exports = {
  lexKey: lexKey,
  readyKey: readyKey,
  ensureIndex: ensureIndex,
};
