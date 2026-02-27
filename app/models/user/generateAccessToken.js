var crypto = require("crypto");
var client = require("models/client-new");
var key = require("./key");

var TOKEN_LENGTH = 16; // characters long

// We can store anything against the generated access
// token – in the case we want to use this token
// to authenticate the log in of an existing user, we
// might store that user's UID. In the case we want to use
// this token to create a new user account, we just store
// a non-empty value, in this case '1', so the validation code
// in checkAccessToken works.
module.exports = function generateAccessToken(options, callback) {
  const { uid, expires } = options;
  const value = uid || 1;
  const seconds = expires || 60 * 60 * 24; // one day

  crypto.randomBytes(TOKEN_LENGTH, function (err, token) {
    if (err) return callback(err);

    token = token.toString("hex");

    (async function () {
      try {
        await client.setEx(key.accessToken(token), seconds, value);
        return callback(null, token);
      } catch (err) {
        return callback(err);
      }
    })();
  });
};
