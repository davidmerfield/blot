var otplib = require("otplib");

// Allow a little clock drift between the server and the user's device:
// accept the previous and next 30-second window in addition to the
// current one.
otplib.authenticator.options = { window: 1 };

module.exports = function verifyTotpToken(secret, token) {
  if (!secret || !token) return false;

  try {
    return otplib.authenticator.check(String(token).replace(/\s+/g, ""), secret);
  } catch (err) {
    return false;
  }
};
