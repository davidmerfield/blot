var crypto = require("crypto");
var bcrypt = require("bcryptjs");
var async = require("async");

var COUNT = 10;

function randomCode() {
  // 10 hex characters, printed as e.g. "3f9a2-1c8be" for readability
  var raw = crypto.randomBytes(5).toString("hex");
  return raw.slice(0, 5) + "-" + raw.slice(5);
}

// Generates a fresh set of one-time backup codes. Returns the plaintext
// codes (to show the user once) alongside their bcrypt hashes (to store).
module.exports = function generateBackupCodes(callback) {
  var codes = [];
  for (var i = 0; i < COUNT; i++) codes.push(randomCode());

  async.map(
    codes,
    function (code, next) {
      bcrypt.hash(code, 10, next);
    },
    function (err, hashes) {
      if (err) return callback(err);
      callback(null, codes, hashes);
    }
  );
};
