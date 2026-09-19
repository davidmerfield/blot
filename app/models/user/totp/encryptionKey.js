var crypto = require("crypto");
var config = require("config");

// Bump this whenever the key derivation changes, and add a branch below to
// derive the matching key for ciphertext tagged with an older version (see
// decrypt.js, which reads this version back off each ciphertext). Without
// this, rotating the key would make every existing totpSecret permanently
// unrecoverable instead of migratable.
var CURRENT_VERSION = 1;

var base = config.security.totp_secret;

if (!base) {
  // Unlike BLOT_SESSION_SECRET (where an ephemeral per-process fallback
  // just costs everyone their dashboard session on restart), silently
  // deriving this key risks two failure modes that are much worse and go
  // unnoticed until a user is already locked out:
  //   - rotating BLOT_SESSION_SECRET (an unrelated, legitimate ops action)
  //     would make every existing totpSecret permanently undecryptable.
  //   - running more than one process without either secret set means
  //     each process picks its own random key, so which process handles a
  //     login determines whether it succeeds.
  // In production, fail loudly at boot instead of degrading silently at
  // decrypt time (see checkTotp.js's catch, which falls through to backup
  // codes with no way for the user to tell why the authenticator stopped
  // working).
  if (config.environment === "production") {
    throw new Error(
      "BLOT_TOTP_ENCRYPTION_SECRET must be set in production. It encrypts " +
        "two-factor secrets at rest and must stay stable and identical " +
        "across every process; see app/models/user/totp/encryptionKey.js."
    );
  }

  base = config.session.secret;

  if (!base) {
    base = crypto.randomBytes(32).toString("hex");
    console.warn(
      "BLOT_TOTP_ENCRYPTION_SECRET and BLOT_SESSION_SECRET are both unset; " +
        "using a process-local ephemeral key to encrypt two-factor secrets. " +
        "Existing two-factor secrets will become unreadable when this " +
        "process restarts."
    );
  }
}

module.exports = {
  version: CURRENT_VERSION,
  key: crypto.scryptSync(base, "blot-totp-secret-encryption", 32)
};
