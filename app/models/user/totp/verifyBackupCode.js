var bcrypt = require("bcryptjs");
var async = require("async");

// Compares a plaintext backup code against a list of stored bcrypt hashes.
// Callback receives (err, index) where index is the matching position in
// `hashes`, or -1 if no code matched.
module.exports = function verifyBackupCode(hashes, code, callback) {
  if (!code || !hashes || !hashes.length) return callback(null, -1);

  var index = -1;

  async.eachOfSeries(
    hashes,
    function (hash, i, next) {
      if (index !== -1) return next();

      bcrypt.compare(code, hash, function (err, match) {
        if (err) return next(err);
        if (match) index = i;
        next();
      });
    },
    function (err) {
      if (err) return callback(err);
      callback(null, index);
    }
  );
};
