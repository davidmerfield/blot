var crypto = require("crypto");
var encryptionKey = require("./encryptionKey");

module.exports = function decrypt(ciphertext) {
  var buffer = Buffer.from(ciphertext, "base64");
  var version = buffer[0];

  // Only one key version has ever existed, so there's nothing to migrate
  // yet -- but checking this explicitly (rather than just letting a wrong
  // key fail the auth tag check below) is what makes a future rotation
  // able to branch on version and pick the right key per-ciphertext.
  if (version !== encryptionKey.version) {
    throw new Error(
      "Unsupported two-factor secret encryption version: " + version
    );
  }

  var iv = buffer.subarray(1, 13);
  var tag = buffer.subarray(13, 29);
  var encrypted = buffer.subarray(29);

  var decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey.key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
};
