var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");

// Removes one occurrence of `hash` from the user's totpBackupCodes, but
// only if it is still present at the moment of the atomic write. This is
// its own compare-and-swap (rather than going through the generic set())
// because set() merges a fixed `updates` value onto whatever it re-reads
// on retry -- which would let two concurrent requests for the same
// one-time backup code both "win", since each recomputes the same
// resulting array from its own stale read. Here presence is re-checked
// against a fresh read on every attempt, so a losing request correctly
// finds the hash already gone and reports it as unconsumed.
var commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
`;

module.exports = function consumeTotpBackupCode(uid, hash, callback) {
  ensure(uid, "string").and(hash, "string").and(callback, "function");

  (async function () {
    for (var attempt = 0; attempt < 20; attempt++) {
      var previous = await client.get(key.user(uid));
      if (!previous) return false;

      var user = JSON.parse(previous);
      var codes = user.totpBackupCodes || [];
      var index = codes.indexOf(hash);

      if (index === -1) return false;

      var updated = codes.slice();
      updated.splice(index, 1);
      user.totpBackupCodes = updated;

      var status = await client.eval(commit, {
        keys: [key.user(uid)],
        arguments: [previous, JSON.stringify(user)]
      });

      if (status === 1) return true;
    }

    throw new Error("User changed too frequently; please retry");
  })().then(function (consumed) {
    callback(null, consumed);
  }, callback);
};
