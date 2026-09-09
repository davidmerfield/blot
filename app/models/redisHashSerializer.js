function serializeRedisHashValue(value, options) {
  const settings = options || {};
  const omitNullish = settings.omitNullish === true;

  if (value === null || typeof value === "undefined") {
    return omitNullish ? undefined : "";
  }

  if (Buffer.isBuffer(value)) return value;

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

module.exports = function serializeRedisHashValues(payload, options) {
  const output = {};

  Object.keys(payload || {}).forEach((field) => {
    const value = serializeRedisHashValue(payload[field], options);
    if (typeof value !== "undefined") output[field] = value;
  });

  return output;
};

module.exports.value = serializeRedisHashValue;
