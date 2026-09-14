var otplib = require("otplib");
var ensure = require("helper/ensure");

// Builds the otpauth:// URI encoded in the QR code shown during setup.
// Authenticator apps use this to label the entry with the site name and
// the account's email address.
module.exports = function getTotpKeyUri(email, secret) {
  ensure(email, "string").and(secret, "string");

  return otplib.authenticator.keyuri(email, "Blot", secret);
};
