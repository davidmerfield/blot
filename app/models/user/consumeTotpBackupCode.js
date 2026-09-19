var ensure = require("helper/ensure");
var casUpdate = require("./casUpdate");

// Removes one occurrence of `hash` from the user's totpBackupCodes, but
// only if it is still present at the moment of the atomic write. Presence
// is re-checked against a fresh read on every retry, so a losing request
// in a race for the same one-time code correctly finds the hash already
// gone and reports it as unconsumed rather than also "winning".
module.exports = function consumeTotpBackupCode(uid, hash, callback) {
  ensure(uid, "string").and(hash, "string").and(callback, "function");

  casUpdate(
    uid,
    function (user) {
      var codes = user.totpBackupCodes || [];
      var index = codes.indexOf(hash);

      if (index === -1) return false;

      var updated = codes.slice();
      updated.splice(index, 1);
      user.totpBackupCodes = updated;
    },
    { retries: 20, notFoundThrows: false },
    callback
  );
};
