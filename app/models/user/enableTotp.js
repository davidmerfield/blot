var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var encrypt = require("./totp/encrypt");
var generateBackupCodes = require("./totp/generateBackupCodes");

// A single compare-and-swap attempt, not the generic set()'s retry-on-
// conflict loop: if two confirmation submissions race (e.g. a double
// click), set()'s retry would let the second silently overwrite the first
// with a different backup-code set after the first has already returned
// its (now-invalid) codes to its caller. Failing the loser here means
// whoever gets a response back always gets the codes actually persisted.
var commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
`;

// Persists a confirmed two-factor secret against the user, replacing any
// existing backup codes with a fresh set. Callback receives (err, codes)
// where codes are the plaintext backup codes — shown to the user once,
// never stored or logged in plaintext.
module.exports = function enableTotp(uid, secret, callback) {
  ensure(uid, "string").and(secret, "string").and(callback, "function");

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

    user.totpEnabled = true;
    user.totpSecret = encrypt(secret);
    user.totpBackupCodes = generated.hashes;

    var status = await client.eval(commit, {
      keys: [key.user(uid)],
      arguments: [previous, JSON.stringify(user)]
    });

    if (status !== 1) {
      var conflict = new Error(
        "Something changed on your account while confirming two-factor authentication; please try again."
      );
      conflict.code = "ECONFLICT";
      throw conflict;
    }

    return generated.codes;
  })().then(function (codes) {
    callback(null, codes);
  }, callback);
};
