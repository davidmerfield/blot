var client = require("models/client");
var key = require("./key");

// You cannot check an access token multiple times
// Once checked, it is no longer valid. The value
// stored against an access token might be meaningless
// (in the case of creating a new account) or it might
// be an existing user's UID, in the case of the forgot
// password flow.
module.exports = function (token, callback) {
  (async function () {
    try {
      // Lua also works on Redis versions before GETDEL was introduced.
      var value = await client.eval(
        "local value = redis.call('GET', KEYS[1]); " +
          "if value then redis.call('DEL', KEYS[1]) end; return value",
        { keys: [key.accessToken(token)], arguments: [] }
      );

      if (!value) return callback(new Error("Invalid access token"));

      return callback(null, value);
    } catch (err) {
      return callback(err);
    }
  })();
};
