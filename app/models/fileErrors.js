const redis = require("models/client");
const normalize = require("helper/pathNormalizer");
const ensure = require("helper/ensure");

const DEFINITIONS = Object.freeze({
  DROPBOX_FILE_TOO_LARGE: {
    title: "File is too large",
    message:
      "Dropbox skipped this file because it exceeds the size limit for syncing to Blot.",
    source: "Dropbox",
  },
  DROPBOX_UNSUPPORTED_EXTENSION: {
    title: "File type is not supported",
    message:
      "Dropbox can't sync this file because its extension isn't supported by Blot.",
    source: "Dropbox",
  },
  DROPBOX_DOWNLOAD_FAILED: {
    title: "Dropbox couldn't download this file",
    message:
      "Dropbox returned an error while downloading this file. Blot will try again automatically.",
    source: "Dropbox",
  },
});

const CODES = Object.freeze(
  Object.keys(DEFINITIONS).reduce((memo, code) => {
    memo[code] = code;
    return memo;
  }, {})
);

function key(blogID) {
  return `blog:${blogID}:file_errors`;
}

function set(blogID, path, code, callback) {
  ensure(blogID, "string").and(path, "string").and(code, "string");

  if (callback && typeof callback !== "function") {
    throw new TypeError("Expected callback with type:Function");
  }

  path = normalize(path);

  redis.hset(key(blogID), path, code, function (err) {
    if (typeof callback === "function") return callback(err || null);
    if (err) throw err;
  });
}

function clear(blogID, path, callback) {
  ensure(blogID, "string").and(path, "string");

  if (callback && typeof callback !== "function") {
    throw new TypeError("Expected callback with type:Function");
  }

  path = normalize(path);

  redis.hdel(key(blogID), path, function (err) {
    if (typeof callback === "function") return callback(err || null);
    if (err) throw err;
  });
}

function getAll(blogID, callback) {
  ensure(blogID, "string");

  if (callback && typeof callback !== "function") {
    throw new TypeError("Expected callback with type:Function");
  }

  redis.hgetall(key(blogID), function (err, map) {
    if (typeof callback === "function") return callback(err, map || {});
    if (err) throw err;
    return map || {};
  });
}

function getStatus(blogID, path, callback) {
  ensure(blogID, "string").and(path, "string");

  if (callback && typeof callback !== "function") {
    throw new TypeError("Expected callback with type:Function");
  }

  path = normalize(path);

  redis.hget(key(blogID), path, function (err, code) {
    if (typeof callback === "function") return callback(err, code);
    if (err) throw err;
    return code;
  });
}

function flush(blogID, callback) {
  ensure(blogID, "string");

  if (callback && typeof callback !== "function") {
    throw new TypeError("Expected callback with type:Function");
  }

  redis.del(key(blogID), function (err) {
    if (typeof callback === "function") return callback(err || null);
    if (err) throw err;
  });
}

function metadata(code) {
  return DEFINITIONS[code];
}

module.exports = {
  set,
  clear,
  getAll,
  getStatus,
  flush,
  codes: CODES,
  definitions: DEFINITIONS,
  metadata,
};
