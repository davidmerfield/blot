var MODEL = {
  uid: "string",
  email: "string",
  blogs: "array",
  isDisabled: "boolean",
  lastSession: "string",
  passwordHash: "string",
  subscription: "object",
  paypal: "object",
  twoFactor: {
    enabled: "boolean",
    secret: "string",
    backupCodes: ["string"],
    lastUsedAt: "string",
  }
};

module.exports = MODEL;
