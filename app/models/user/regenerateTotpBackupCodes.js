var ensure = require("helper/ensure");
var casUpdate = require("./casUpdate");
var generateBackupCodes = require("./totp/generateBackupCodes");

// Replaces a user's backup codes with a fresh set, invalidating any
// codes that were not yet used. Callback receives (err, codes) where
// codes are the new plaintext codes, shown to the user once.
module.exports = function regenerateTotpBackupCodes(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  generateBackupCodes(function (err, codes, hashes) {
    if (err) return callback(err);

    casUpdate(
      uid,
      function (user) {
        user.totpBackupCodes = hashes;
      },
      {
        conflictMessage:
          "Your backup codes were just changed elsewhere; please reload and try again."
      },
      function (err) {
        if (err) return callback(err);
        callback(null, codes);
      }
    );
  });
};
