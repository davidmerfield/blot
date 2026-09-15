const EntryInstance = require("models/entry/instance");

function cloneDeepManual(value, { preserveEntryInstances = false } = {}) {
  if (Array.isArray(value)) {
    const clone = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      clone[i] = cloneDeepManual(value[i], { preserveEntryInstances });
    }
    return clone;
  }

  if (value && typeof value === "object") {
    const clone =
      preserveEntryInstances && value instanceof EntryInstance
        ? new EntryInstance()
        : {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      clone[key] = cloneDeepManual(value[key], { preserveEntryInstances });
    }
    return clone;
  }

  return value;
}

function restoreEntryInstances(cloned, original) {
  if (!cloned || typeof cloned !== "object" || !original || typeof original !== "object") {
    return cloned;
  }

  if (original instanceof EntryInstance) {
    Object.setPrototypeOf(cloned, EntryInstance.prototype);
  }

  if (Array.isArray(cloned) && Array.isArray(original)) {
    const len = Math.min(cloned.length, original.length);
    for (let i = 0; i < len; i++) {
      restoreEntryInstances(cloned[i], original[i]);
    }
    return cloned;
  }

  const keys = Object.keys(cloned);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    restoreEntryInstances(cloned[key], original[key]);
  }
  return cloned;
}

// structuredClone is native and much faster than a recursive property walk
// for the JSON-like trees we store in LRUs. It strips prototypes, so Entry
// instances are restored from the original tree when requested. Functions
// (e.g. Mustache date lambdas) are not structured-cloneable; fall back to
// the recursive copy in that case so callers still get a usable object.
function cloneDeep(value, options = {}) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  try {
    const cloned = structuredClone(value);
    if (options.preserveEntryInstances) {
      restoreEntryInstances(cloned, value);
    }
    return cloned;
  } catch (e) {
    return cloneDeepManual(value, options);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    deepFreeze(value[keys[i]]);
  }

  return Object.freeze(value);
}

// Clone, freeze and measure a value in one walk for insertion into an LRU.
// The estimate describes retained JavaScript data rather than a temporary
// serialization: strings and enumerable object keys contribute their UTF-8
// byte length; arrays contribute 8 bytes per element; objects contribute 16
// bytes per enumerable property; and primitives contribute 8 bytes.
// Supported containers are arrays and enumerable objects (the same domain as
// cloneDeep); EntryInstance objects use the object rules and retain their
// prototype when requested.
// Container/property overhead is deliberately included so maxSize remains a
// conservative memory bound. Circular values are unsupported, just as they
// are by the JSON based size calculation this replaces.
function prepareCacheValue(value, { preserveEntryInstances = false } = {}) {
  const seen = new Set();

  function visit(input) {
    if (typeof input === "string") {
      return { payload: input, size: Buffer.byteLength(input) || 1 };
    }
    if (!input || typeof input !== "object") {
      return { payload: input, size: 8 };
    }
    if (seen.has(input))
      throw new TypeError("Cannot prepare circular cache value");

    seen.add(input);
    const payload = Array.isArray(input)
      ? []
      : preserveEntryInstances && input instanceof EntryInstance
        ? new EntryInstance()
        : {};
    let size = Array.isArray(input) ? 16 : 24;

    for (const key of Object.keys(input)) {
      const child = visit(input[key]);
      payload[key] = child.payload;
      size += child.size;
      size += Array.isArray(input) ? 8 : 16 + Buffer.byteLength(key);
    }
    seen.delete(input);
    return { payload: Object.freeze(payload), size: Math.max(1, size) };
  }

  const prepared = visit(value);
  return Object.freeze(prepared);
}

// Size-only walk for LRU maxSize when the payload cannot go through
// prepareCacheValue (Date fields become {}). Same accounting as visit().
function estimateCacheSize(value, seen) {
  if (typeof value === "string") return Buffer.byteLength(value) || 1;
  if (!value || typeof value !== "object") return 8;
  if (value instanceof Date) return 8;
  seen = seen || new Set();
  if (seen.has(value)) return 0;
  seen.add(value);
  let size = Array.isArray(value) ? 16 : 24;
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    size += Array.isArray(value) ? 8 : 16 + Buffer.byteLength(key);
    size += estimateCacheSize(value[key], seen);
  }
  return Math.max(1, size);
}

module.exports = { cloneDeep, deepFreeze, prepareCacheValue, estimateCacheSize };
