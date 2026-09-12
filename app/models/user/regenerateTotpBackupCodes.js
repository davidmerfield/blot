var ensure = require("helper/ensure");
var set = require("./set");
var generateBackupCodes = require("./totp/generateBackupCodes");

// Replaces a user's backup codes with a fresh set, invalidating any
// codes that were not yet used. Callback receives (err, codes) where
// codes are the new plaintext codes, shown to the user once.
module.exports = function regenerateTotpBackupCodes(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  generateBackupCodes(function (err, codes, hashes) {
    if (err) return callback(err);

    set(uid, { totpBackupCodes: hashes }, function (err) {
      if (err) return callback(err);
      callback(null, codes);
    });
  });
};
