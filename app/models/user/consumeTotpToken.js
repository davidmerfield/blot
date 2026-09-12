var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");

// TOTP verification is stateless: the same 6-digit value stays valid for
// its whole window (~90s with the +/-1 step tolerance used elsewhere in
// this feature). Without tracking what's already been accepted, a code
// captured via phishing, logs, or a shared screen remains usable by
// anyone else for the rest of that window, even after the account owner
// has already logged in with it. This window comfortably covers that.
var REPLAY_WINDOW_MS = 90 * 1000;

var commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
`;

// Records a just-verified TOTP code as used for this account, rejecting it
// if the same code was already accepted within its own validity window.
// Callback receives (err, accepted).
module.exports = function consumeTotpToken(uid, code, callback) {
  ensure(uid, "string").and(code, "string").and(callback, "function");

  (async function () {
    var previous = await client.get(key.user(uid));
    if (!previous) return false;

    var user = JSON.parse(previous);
    var now = Date.now();

    if (
      user.totpLastUsedCode === code &&
      now - (user.totpLastUsedAt || 0) < REPLAY_WINDOW_MS
    ) {
      return false;
    }

    user.totpLastUsedCode = code;
    user.totpLastUsedAt = now;

    var status = await client.eval(commit, {
      keys: [key.user(uid)],
      arguments: [previous, JSON.stringify(user)]
    });

    // A concurrent write raced us -- fail closed rather than accept a code
    // without actually recording it as used.
    return status === 1;
  })().then(function (accepted) {
    callback(null, accepted);
  }, callback);
};
