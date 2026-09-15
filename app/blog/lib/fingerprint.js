// Stable, order-independent identity for cache keys. Redis hashes are
// already string-valued; JS objects (blog records, template locals) need
// sorted keys so equivalent state fingerprints the same way.

function fingerprintHash(raw) {
  if (!raw || typeof raw !== "object") return "";
  const keys = Object.keys(raw).sort();
  let out = "";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    out += key + "=" + raw[key] + "\n";
  }
  return out;
}

function fingerprintValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number" || t === "boolean") return String(value);
  if (t === "function") return "";
  if (t !== "object") return String(value);
  if (value instanceof Date) return "Date:" + value.getTime();
  if (Array.isArray(value)) {
    return "[" + value.map(fingerprintValue).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  let out = "{";
  let wrote = false;
  for (let i = 0; i < keys.length; i++) {
    const nested = value[keys[i]];
    if (typeof nested === "function") continue;
    if (wrote) out += ",";
    out += JSON.stringify(keys[i]) + ":" + fingerprintValue(nested);
    wrote = true;
  }
  return out + "}";
}

module.exports = { fingerprintHash, fingerprintValue };
