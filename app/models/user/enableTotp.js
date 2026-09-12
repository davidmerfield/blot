var ensure = require("helper/ensure");
var set = require("./set");
var encrypt = require("./totp/encrypt");
var generateBackupCodes = require("./totp/generateBackupCodes");

// Persists a confirmed two-factor secret against the user, replacing any
// existing backup codes with a fresh set. Callback receives (err, codes)
// where codes are the plaintext backup codes — shown to the user once,
// never stored or logged in plaintext.
module.exports = function enableTotp(uid, secret, callback) {
  ensure(uid, "string").and(secret, "string").and(callback, "function");

  generateBackupCodes(function (err, codes, hashes) {
    if (err) return callback(err);

    set(
      uid,
      {
        totpEnabled: true,
        totpSecret: encrypt(secret),
        totpBackupCodes: hashes
      },
      function (err) {
        if (err) return callback(err);
        callback(null, codes);
      }
    );
  });
};
