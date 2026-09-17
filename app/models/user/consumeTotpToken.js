var ensure = require("helper/ensure");
var casUpdate = require("./casUpdate");

// TOTP verification is stateless: the same 6-digit value stays valid for
// its whole window (~90s with the +/-1 step tolerance used elsewhere in
// this feature). Without tracking what's already been accepted, a code
// captured via phishing, logs, or a shared screen remains usable by
// anyone else for the rest of that window, even after the account owner
// has already logged in with it. This window comfortably covers that.
var REPLAY_WINDOW_MS = 90 * 1000;

// Records a just-verified TOTP code as used for this account, rejecting it
// if the same code was already accepted within its own validity window.
// Callback receives (err, accepted).
module.exports = function consumeTotpToken(uid, code, callback) {
  ensure(uid, "string").and(code, "string").and(callback, "function");

  casUpdate(
    uid,
    function (user) {
      var now = Date.now();

      if (
        user.totpLastUsedCode === code &&
        now - (user.totpLastUsedAt || 0) < REPLAY_WINDOW_MS
      ) {
        return false;
      }

      user.totpLastUsedCode = code;
      user.totpLastUsedAt = now;
    },
    // A concurrent write racing us should fail closed rather than accept
    // a code without actually recording it as used.
    { notFoundThrows: false, failClosed: true },
    callback
  );
};
