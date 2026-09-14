var bcrypt = require("bcryptjs");
var async = require("async");

// Compares a plaintext backup code against a list of stored bcrypt hashes.
// Callback receives (err, index) where index is the matching position in
// `hashes`, or -1 if no code matched. Always compares against every hash,
// even after a match is found, so the response time doesn't reveal which
// (if any) position matched.
module.exports = function verifyBackupCode(hashes, code, callback) {
  if (!code || !hashes || !hashes.length) return callback(null, -1);

  async.map(
    hashes,
    function (hash, next) {
      bcrypt.compare(code, hash, next);
    },
    function (err, matches) {
      if (err) return callback(err);
      callback(null, matches.indexOf(true));
    }
  );
};
