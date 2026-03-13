var ensure = require("helper/ensure");
var client = require("models/client");
var key = require("./key");
var getById = require("./getById");

module.exports = function getBy(email, callback) {
  ensure(email, "string").and(callback, "function");

  email = email.trim().toLowerCase();

  client.get(key.email(email), function (err, uid) {
    if (err) return callback(err);

    if (!uid) return callback(null, null);

    getById(uid, callback);
  });
};
