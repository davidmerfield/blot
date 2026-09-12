var crypto = require("crypto");
var key = require("./encryptionKey");

module.exports = function encrypt(plaintext) {
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  var encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64"
  );
};
