var ensure = require("helper/ensure");
var set = require("./set");

module.exports = function disableTotp(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  set(
    uid,
    {
      totpEnabled: false,
      totpSecret: "",
      totpBackupCodes: [],
      totpLastUsedCode: "",
      totpLastUsedAt: 0
    },
    callback
  );
};
