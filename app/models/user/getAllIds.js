var client = require("models/client-new");
var ensure = require("helper/ensure");
var key = require("./key");

module.exports = function getAllIds(callback) {
  ensure(callback, "function");

  (async function () {
    try {
      var uids = await client.sMembers(key.uids);
      return callback(null, uids);
    } catch (err) {
      return callback(err);
    }
  })();
};
