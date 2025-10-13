const exifReader = require("exif-reader");
const { normalize } = require("models/blog/util/imageExif");

const SENSITIVE_KEY_FRAGMENTS = [
  "gps",
  "location",
  "position",
  "latitude",
  "longitude",
  "serial",
  "owner",
  "address",
  "contact",
];

function parseExif(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return {};

  try {
    return exifReader(buffer);
  } catch (err) {
    return {};
  }
}

function toSerializable(value) {
  if (value === undefined || value === null) return value;
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .map((item) => toSerializable(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const result = {};
    Object.keys(value).forEach((key) => {
      const serialized = toSerializable(value[key]);
      if (serialized !== undefined) result[key] = serialized;
    });
    return result;
  }

  return value;
}

function stripSensitive(value) {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    const arr = value
      .map((item) => stripSensitive(item))
      .filter((item) => item !== undefined);
    return arr.length ? arr : undefined;
  }

  if (typeof value !== "object") return value;

  const result = {};

  Object.keys(value).forEach((key) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment))) return;

    const sanitized = stripSensitive(value[key]);
    if (sanitized !== undefined) result[key] = sanitized;
  });

  return Object.keys(result).length ? result : undefined;
}

function sanitizeExif(exifData, mode) {
  const normalizedMode = normalize(mode, { fallback: "off" });

  if (normalizedMode === "off") return {};

  const serializable = toSerializable(exifData || {});

  if (normalizedMode === "full") return serializable || {};

  const sanitized = stripSensitive(serializable || {});
  return sanitized || {};
}

module.exports = {
  parseExif,
  sanitizeExif,
  SENSITIVE_KEY_FRAGMENTS,
};
