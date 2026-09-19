var ensure = require("helper/ensure");
var casUpdate = require("./casUpdate");

// TOTP verification is stateless: with the +/-1 step tolerance in
// verifyTotpToken, a given 6-digit code stays valid across a ~90s span
// (the previous, current, and next 30s step). Tracking only the single
// most-recently-accepted code isn't enough to guard against replay over
// that whole span: once a second, different code is accepted, it
// overwrites the record of the first one, so a captured earlier code --
// still within its own 90s window -- would pass the replay check again.
// Every code accepted within the last 90s has to be remembered, not just
// the latest one.
var REPLAY_WINDOW_MS = 90 * 1000;

function pruneExpired(usedCodes, now) {
  return (usedCodes || []).filter(function (entry) {
    return now - entry.at < REPLAY_WINDOW_MS;
  });
}

// Records a just-verified TOTP code as used for this account, rejecting it
// if the same code was already accepted within its own validity window.
// Callback receives (err, accepted).
module.exports = function consumeTotpToken(uid, code, callback) {
  ensure(uid, "string").and(code, "string").and(callback, "function");

  casUpdate(
    uid,
    function (user) {
      var now = Date.now();
      var usedCodes = pruneExpired(user.totpUsedCodes, now);

      if (
        usedCodes.some(function (entry) {
          return entry.code === code;
        })
      ) {
        return false;
      }

      usedCodes.push({ code: code, at: now });
      user.totpUsedCodes = usedCodes;
    },
    // A concurrent write racing us should fail closed rather than accept
    // a code without actually recording it as used.
    { notFoundThrows: false, failClosed: true },
    callback
  );
};
