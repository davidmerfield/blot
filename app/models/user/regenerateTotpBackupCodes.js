var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var generateBackupCodes = require("./totp/generateBackupCodes");

// A single compare-and-swap attempt, not the generic set()'s retry-on-
// conflict loop: if two regenerate requests race (e.g. a double click or
// two open tabs), set()'s retry would let the second silently overwrite the
// first with a different code set after the first has already displayed
// its (now-invalid) codes to the user. Failing the loser here means
// whoever gets a response back always gets the codes actually persisted.
var commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
`;

// Replaces a user's backup codes with a fresh set, invalidating any
// codes that were not yet used. Callback receives (err, codes) where
// codes are the new plaintext codes, shown to the user once.
module.exports = function regenerateTotpBackupCodes(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  (async function () {
    var previous = await client.get(key.user(uid));
    if (!previous) throw new Error("No user");

    var user = JSON.parse(previous);

    var generated = await new Promise(function (resolve, reject) {
      generateBackupCodes(function (err, codes, hashes) {
        if (err) return reject(err);
        resolve({ codes: codes, hashes: hashes });
      });
    });

    user.totpBackupCodes = generated.hashes;

    var status = await client.eval(commit, {
      keys: [key.user(uid)],
      arguments: [previous, JSON.stringify(user)]
    });

    if (status !== 1) {
      var conflict = new Error(
        "Your backup codes were just changed elsewhere; please reload and try again."
      );
      conflict.code = "ECONFLICT";
      throw conflict;
    }

    return generated.codes;
  })().then(function (codes) {
    callback(null, codes);
  }, callback);
};
