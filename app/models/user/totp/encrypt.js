var crypto = require("crypto");
var encryptionKey = require("./encryptionKey");

module.exports = function encrypt(plaintext) {
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey.key, iv);
  var encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  // Leading version byte lets decrypt.js identify which key a ciphertext
  // was encrypted with, so a future key rotation can be migrated instead
  // of breaking every existing totpSecret at once.
  return Buffer.concat([
    Buffer.from([encryptionKey.version]),
    iv,
    cipher.getAuthTag(),
    encrypted
  ]).toString("base64");
};
