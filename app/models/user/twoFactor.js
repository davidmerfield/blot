const ensure = require("helper/ensure");
const crypto = require("crypto");
const { authenticator } = require("otplib");


function createDefaultConfig() {
  return {
    enabled: false,
    secret: "",
    backupCodes: [],
    lastUsedAt: "",
  };
}

const DEFAULT_CONFIG = Object.freeze(createDefaultConfig());

function normalizeStoredConfig(config) {
  if (!config || typeof config !== "object") {
    return createDefaultConfig();
  }

  const normalized = createDefaultConfig();

  normalized.enabled = !!config.enabled;
  if (typeof config.secret === "string" && config.secret.trim()) {
    normalized.secret = config.secret.trim();
  }

  if (Array.isArray(config.backupCodes)) {
    normalized.backupCodes = sanitizeBackupCodes(config.backupCodes);
  }

  if (typeof config.lastUsedAt === "string") {
    normalized.lastUsedAt = config.lastUsedAt;
  }

  return normalized;
}

const BACKUP_CODE_LENGTH = 10;
const DEFAULT_BACKUP_CODES = 10;

let secretGenerator = () => authenticator.generateSecret();
let backupCodeGenerator = () => formatBackupCode(crypto.randomBytes(8).toString("hex"));
let epochOverride = null;

function formatBackupCode(code) {
  return code
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, BACKUP_CODE_LENGTH)
    .replace(/(.{5})/, "$1-")
    .slice(0, BACKUP_CODE_LENGTH + 1);
}

function sanitizeBackupCodes(codes) {
  if (!Array.isArray(codes)) return [];
  return codes
    .map((code) => normalizeToken(code))
    .filter(Boolean)
    .map((code) => formatBackupCode(code));
}

function normalizeToken(token = "") {
  return token.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function getEpochOverride() {
  return typeof epochOverride === "number" ? epochOverride : null;
}

function withAuthenticatorEpoch(fn) {
  const originalOptions = { ...authenticator.options }; // clone
  const override = getEpochOverride();
  authenticator.options = {
    ...authenticator.options,
    window: authenticator.options.window || 1,
  };

  if (override !== null) {
    authenticator.options = {
      ...authenticator.options,
      epoch: override,
    };
  } else if (authenticator.options.epoch) {
    delete authenticator.options.epoch;
  }

  try {
    return fn();
  } finally {
    authenticator.options = originalOptions;
  }
}

function generateSecret() {
  return secretGenerator();
}

function generateBackupCodes(total = DEFAULT_BACKUP_CODES) {
  ensure(total, "number");

  const codes = [];

  for (let i = 0; i < total; i++) {
    codes.push(formatBackupCode(backupCodeGenerator()));
  }

  return codes;
}

function maskSecret(secret) {
  if (!secret) return "";
  const normalized = secret.replace(/[^A-Z2-7]/gi, "");
  if (normalized.length <= 4) return normalized.replace(/./g, "•");
  const visible = normalized.slice(-4);
  const masked = normalized
    .slice(0, -4)
    .replace(/./g, "•")
    .match(/.{1,4}/g)
    .join(" ");
  return `${masked} ${visible}`.trim();
}

function enable(uid, config, callback) {
  ensure(uid, "string").and(callback, "function");

  const secret = ensureSecret(config && config.secret);
  const codes = sanitizeBackupCodes(
    (config && config.backupCodes) || generateBackupCodes()
  );

  const setUser = require("./set");

  const twoFactor = {
    enabled: true,
    secret,
    backupCodes: codes,
    lastUsedAt: "",
  };

  setUser(uid, { twoFactor }, function (err) {
    if (err) return callback(err);
    callback(null, twoFactor);
  });
}

function ensureSecret(secret) {
  const value = (secret || generateSecret()).trim();
  if (!value) throw new Error("Missing two-factor secret");
  return value;
}

function disable(uid, callback) {
  ensure(uid, "string").and(callback, "function");

  const setUser = require("./set");

  setUser(uid, { twoFactor: createDefaultConfig() }, callback);
}

function validate(uid, token, callback) {
  ensure(uid, "string").and(callback, "function");

  const normalized = normalizeToken(token);

  if (!normalized) return callback(null, { verified: false });

  const getById = require("./getById");

  getById(uid, function (err, user) {
    if (err) return callback(err);
    if (!user || !user.twoFactor || !user.twoFactor.enabled) {
      return callback(null, { verified: false });
    }

    const config = user.twoFactor;
    let verifiedMethod = null;

    if (config.secret) {
      const totpMatch = withAuthenticatorEpoch(() =>
        authenticator.check(normalized, config.secret)
      );

      if (totpMatch) {
        verifiedMethod = "totp";
      }
    }

    const codes = Array.isArray(config.backupCodes)
      ? config.backupCodes.slice()
      : [];

    let codeIndex = -1;

    if (!verifiedMethod && codes.length) {
      codeIndex = codes.findIndex((code) => normalizeToken(code) === normalized);
      if (codeIndex > -1) {
        verifiedMethod = "backup";
        codes.splice(codeIndex, 1);
      }
    }

    if (!verifiedMethod) {
      return callback(null, { verified: false });
    }

    const updated = {
      twoFactor: {
        enabled: true,
        secret: config.secret,
        backupCodes: verifiedMethod === "backup" ? codes : config.backupCodes,
        lastUsedAt: new Date(getEpochOverride() || Date.now()).toISOString(),
      },
    };

    const setUser = require("./set");

    setUser(uid, updated, function (setErr) {
      if (setErr) return callback(setErr);
      callback(null, { verified: true, method: verifiedMethod });
    });
  });
}

function verifyWithSecret(secret, token) {
  if (!secret) return false;
  const normalized = normalizeToken(token);
  if (!normalized) return false;

  return withAuthenticatorEpoch(() => authenticator.check(normalized, secret));
}

function resetTestOverrides() {
  secretGenerator = () => authenticator.generateSecret();
  backupCodeGenerator = () =>
    formatBackupCode(crypto.randomBytes(8).toString("hex"));
  epochOverride = null;
}

module.exports = {
  DEFAULT_CONFIG,
  createDefaultConfig,
  normalizeStoredConfig,
  disable,
  enable,
  generateBackupCodes,
  generateSecret,
  maskSecret,
  sanitizeBackupCodes,
  validate,
  verifyWithSecret,
  testing: {
    reset: resetTestOverrides,
    setBackupCodeGenerator(fn) {
      backupCodeGenerator = typeof fn === "function" ? fn : backupCodeGenerator;
    },
    setSecretGenerator(fn) {
      secretGenerator = typeof fn === "function" ? fn : secretGenerator;
    },
    setTime(epoch) {
      epochOverride = typeof epoch === "number" ? epoch : null;
    },
    generateToken(secret) {
      return withAuthenticatorEpoch(() => authenticator.generate(secret));
    },
  },
};
