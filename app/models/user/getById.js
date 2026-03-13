var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
function applyUserDefaults(user) {
  if (!user || typeof user !== "object") return user;

  if (typeof user.created === "undefined") user.created = 0;
  if (typeof user.welcomeEmailSent === "undefined")
    user.welcomeEmailSent = true;

  return user;
}

module.exports = function getById(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  client.get(key.user(uid), function (err, user) {
    if (err) return callback(err);

    if (!user) return callback(null, null);

    try {
      user = JSON.parse(user);
      ensure(user, "object");
    } catch (err) {
      return callback(new Error("BADJSON"));
    }

    return callback(null, applyUserDefaults(user));
  });
};
