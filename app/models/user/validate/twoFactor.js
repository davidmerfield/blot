var ensure = require("helper/ensure");
var model = require("../model");
var twoFactor = require("../twoFactor");

module.exports = function validateTwoFactor(user, value, callback) {
  try {
    ensure(value, model.twoFactor);
  } catch (err) {
    return callback(err);
  }

  var sanitized = {
    enabled: !!value.enabled,
    secret: (value.secret || "").trim(),
    backupCodes: twoFactor.sanitizeBackupCodes(value.backupCodes),
    lastUsedAt: value.lastUsedAt || "",
  };

  callback(null, sanitized);
};
