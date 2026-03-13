var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var getById = require("./getById");

module.exports = function getBy(email, callback) {
  ensure(email, "string").and(callback, "function");

  email = email.trim().toLowerCase();

  (async function () {
    try {
      var uid = await client.get(key.email(email));

      if (!uid) return callback(null, null);

      return getById(uid, callback);
    } catch (err) {
      return callback(err);
    }
  })();
};
