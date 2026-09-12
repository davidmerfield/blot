var MODEL = {
  uid: "string",
  email: "string",
  blogs: "array",
  isDisabled: "boolean",
  lastSession: "string",
  created: "number",
  welcomeEmailSent: "boolean",
  passwordHash: "string",
  subscription: "object",
  paypal: "object",
  totpEnabled: "boolean",
  totpSecret: "string",
  totpBackupCodes: "array",
  totpLastUsedCode: "string",
  totpLastUsedAt: "number"
};

module.exports = MODEL;
