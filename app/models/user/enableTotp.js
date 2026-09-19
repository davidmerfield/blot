var ensure = require("helper/ensure");
var casUpdate = require("./casUpdate");
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

    casUpdate(
      uid,
      function (user) {
        user.totpEnabled = true;
        user.totpSecret = encrypt(secret);
        user.totpBackupCodes = hashes;
      },
      {
        conflictMessage:
          "Something changed on your account while confirming two-factor authentication; please try again."
      },
      function (err) {
        if (err) return callback(err);
        callback(null, codes);
      }
    );
  });
};
