var ensure = require("helper/ensure");
var getById = require("./getById");
var set = require("./set");
var decrypt = require("./totp/decrypt");
var verifyBackupCode = require("./totp/verifyBackupCode");
var verifyTotpToken = require("./verifyTotpToken");

// Checks a code entered during log-in against a user's authenticator app
// secret, falling back to their one-time backup codes. Callback receives
// (err, valid, method) where method is "totp" or "backup" when valid is
// true. A backup code is consumed (removed) the moment it is used.
module.exports = function checkTotp(uid, code, callback) {
  ensure(uid, "string").and(code, "string").and(callback, "function");

  getById(uid, function (err, user) {
    if (err) return callback(err);
    if (!user || !user.totpEnabled) return callback(null, false);

    if (verifyTotpToken(decrypt(user.totpSecret), code)) {
      return callback(null, true, "totp");
    }

    verifyBackupCode(user.totpBackupCodes, code, function (err, index) {
      if (err) return callback(err);
      if (index === -1) return callback(null, false);

      var remaining = user.totpBackupCodes.slice();
      remaining.splice(index, 1);

      set(uid, { totpBackupCodes: remaining }, function (err) {
        if (err) return callback(err);
        callback(null, true, "backup");
      });
    });
  });
};
