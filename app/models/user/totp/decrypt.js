var crypto = require("crypto");
var key = require("./encryptionKey");

module.exports = function decrypt(ciphertext) {
  var buffer = Buffer.from(ciphertext, "base64");
  var iv = buffer.subarray(0, 12);
  var tag = buffer.subarray(12, 28);
  var encrypted = buffer.subarray(28);

  var decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
};
