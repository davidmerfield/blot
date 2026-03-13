var client = require("models/client");
var key = require("./key");

// You cannot check an access token multiple times
// Once checked, it is no longer valid. The value 
// stored against an access token might be meaningless
// (in the case of creating a new account) or it might
// be an existing user's UID, in the case of the forgot
// password flow.
module.exports = function (token, callback) {
  client.get(key.accessToken(token), function (err, value) {
    if (err || !value) return callback(new Error("Invalid access token"));

    client.del(key.accessToken(token), function (err) {
      if (err) throw err;

      callback(null, value);
    });
  });
};
