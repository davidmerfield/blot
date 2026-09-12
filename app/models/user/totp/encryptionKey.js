var crypto = require("crypto");
var config = require("config");

// Two-factor secrets must be reversible (we need the plaintext to check
// codes against them) so, unlike passwords, they can't just be hashed.
// Encrypt them at rest instead, deriving the key from a dedicated secret
// with a session-secret fallback so self-hosted installs don't need a
// second env var configured. Mirrors the ephemeral-secret fallback in
// dashboard/util/session.js, with the same restart caveat: without a
// configured secret, previously-encrypted totpSecrets become unreadable
// (and 2FA login breaks) whenever this process restarts.
var base = config.security.totp_secret || config.session.secret;

if (!base) {
  base = crypto.randomBytes(32).toString("hex");
  console.warn(
    "BLOT_TOTP_ENCRYPTION_SECRET and BLOT_SESSION_SECRET are both unset; " +
      "using a process-local ephemeral key to encrypt two-factor secrets. " +
      "Existing two-factor secrets will become unreadable when this " +
      "process restarts."
  );
}

module.exports = crypto.scryptSync(base, "blot-totp-secret-encryption", 32);
