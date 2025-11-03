function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === null) return false;
  if (typeof value === "undefined") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value;
  }

  if (typeof value === "string") {
    var normalized = value.trim().toLowerCase();

    if (!normalized) return false;

    if (normalized === "true" || normalized === "on" || normalized === "1")
      return true;

    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "n" ||
      normalized === "null" ||
      normalized === "undefined"
    )
      return false;

    return value;
  }

  return value;
}

module.exports = parseBoolean;
