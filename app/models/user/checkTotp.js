var ensure = require("helper/ensure");
var getById = require("./getById");
var consumeTotpBackupCode = require("./consumeTotpBackupCode");
var consumeTotpToken = require("./consumeTotpToken");
var decrypt = require("./totp/decrypt");
var verifyBackupCode = require("./totp/verifyBackupCode");
var verifyTotpToken = require("./verifyTotpToken");

// Checks a code entered during log-in against a user's authenticator app
// secret, falling back to their one-time backup codes. Callback receives
// (err, valid, method) where method is "totp" or "backup" when valid is
// true. A backup code is consumed (removed) the moment it is used.
module.exports = function checkTotp(uid, code, callback) {
  ensure(uid, "string").and(code, "string").and(callback, "function");

  // Canonicalize once, up front: verifyTotpToken strips whitespace before
  // comparing against the secret, so "123456" and " 123 456" verify as the
  // same code. The replay guard must track that same canonical form, or a
  // whitespace-padded resubmission would slip past it as if it were new.
  var canonicalCode = code.replace(/\s+/g, "");

  getById(uid, function (err, user) {
    if (err) return callback(err);
    if (!user || !user.totpEnabled) return callback(null, false);

    // A corrupt ciphertext, or a secret that no longer decrypts because the
    // encryption key changed, must not crash the process -- treat it as a
    // failed TOTP check and fall through to the backup codes.
    var secret;
    try {
      secret = decrypt(user.totpSecret);
    } catch (err) {
      secret = null;
    }

    if (secret && verifyTotpToken(secret, canonicalCode)) {
      return consumeTotpToken(uid, canonicalCode, function (err, accepted) {
        if (err) return callback(err);
        // Already used once within its own validity window (replay).
        if (!accepted) return callback(null, false);
        callback(null, true, "totp");
      });
    }

    verifyBackupCode(user.totpBackupCodes, code, function (err, index) {
      if (err) return callback(err);
      if (index === -1) return callback(null, false);

      var hash = user.totpBackupCodes[index];

      consumeTotpBackupCode(uid, hash, function (err, consumed) {
        if (err) return callback(err);
        // Lost the race with another request consuming the same code.
        if (!consumed) return callback(null, false);
        callback(null, true, "backup");
      });
    });
  });
};
