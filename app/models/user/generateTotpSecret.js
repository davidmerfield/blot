var otplib = require("otplib");

module.exports = function generateTotpSecret() {
  return otplib.authenticator.generateSecret();
};
