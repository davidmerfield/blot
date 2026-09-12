var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
function applyUserDefaults(user) {
  if (!user || typeof user !== "object") return user;

  if (typeof user.created === "undefined") user.created = 0;
  if (typeof user.welcomeEmailSent === "undefined")
    user.welcomeEmailSent = true;
  if (typeof user.totpEnabled === "undefined") user.totpEnabled = false;
  if (typeof user.totpSecret === "undefined") user.totpSecret = "";
  if (typeof user.totpBackupCodes === "undefined") user.totpBackupCodes = [];
  if (typeof user.totpLastUsedCode === "undefined") user.totpLastUsedCode = "";
  if (typeof user.totpLastUsedAt === "undefined") user.totpLastUsedAt = 0;

  return user;
}

module.exports = function getById(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  (async function () {
    try {
      var user = await client.get(key.user(uid));

      if (!user) return callback(null, null);

      try {
        user = JSON.parse(user);
        ensure(user, "object");
      } catch (err) {
        return callback(new Error("BADJSON"));
      }

      return callback(null, applyUserDefaults(user));
    } catch (err) {
      return callback(err);
    }
  })();
};
