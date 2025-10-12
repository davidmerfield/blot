var fs = require("fs-extra");
var crypto = require("crypto");
var debug = require("debug")("blot:helper:transformer:hash");

module.exports = function (path, callback) {
  if (typeof callback === "function") {
    return hashFile(path, callback);
  }

  return new Promise(function (resolve, reject) {
    hashFile(path, function (err, hash) {
      if (err) return reject(err);
      resolve(hash);
    });
  });
};

function hashFile(path, callback) {
  var hash;

  fs.createReadStream(path)
    .on("error", callback)
    .pipe(crypto.createHash("sha1").setEncoding("hex"))
    .on("finish", function () {
      hash = this.read();
      debug(path, "hashed to", hash);
      callback(null, hash);
    });
}
