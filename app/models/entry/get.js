var ensure = require("helper/ensure");
var type = require("helper/type");

var redis = require("models/client");
var key = require("./key");
var entryKey = key.entry;
var entryHashKey = key.entryHash;
var format = require("./format");

var Entry = require("./instance");

// get(blogID, entryIDs, [fields], callback)
//
// entryIDs may be a single path (string) or an array of paths.
//
// fields (optional) restricts which entry properties are read:
//   - undefined  -> whole entry (HGETALL, falling back to the legacy JSON key)
//   - "title"    -> just that field. For a single-entry lookup the raw value is
//                   returned instead of an Entry object.
//   - ["a", "b"] -> an Entry carrying only those fields.
//
// The Redis hash written by ./set.js is the source of truth. Entries that have
// not been backfilled yet (scripts/entry/backfill-hashes.js) have no hash, so
// we fall back to the JSON string key and coerce it through the same model.
module.exports = function (blogID, entryIDs, fields, callback) {
  if (typeof fields === "function") {
    callback = fields;
    fields = undefined;
  }

  ensure(blogID, "string").and(callback, "function");

  var single = false;

  // Empty list of entry IDs, leave now!
  if (type(entryIDs, "array") && !entryIDs.length) {
    return callback([]);
  }

  // We're only getting one entry now...
  if (type(entryIDs, "string")) {
    single = true;
    entryIDs = [entryIDs];
  }

  ensure(entryIDs, "array");

  var scalarMode = single && typeof fields === "string";

  var fieldList = null;
  if (typeof fields === "string") {
    fieldList = [fields];
  } else if (Array.isArray(fields) && fields.length) {
    fieldList = fields.slice();
    // Always carry id so callers can still identify the entry.
    if (fieldList.indexOf("id") === -1) fieldList.push("id");
  }

  var hashKeys = entryIDs.map(function (entryID) {
    return entryHashKey(blogID, entryID);
  });

  var reads = hashKeys.map(function (hashKey) {
    return fieldList ? redis.hmGet(hashKey, fieldList) : redis.hGetAll(hashKey);
  });

  Promise.all(reads)
    .then(function (hashResults) {
      // Work out which entries had no hash and need the legacy JSON key.
      var missingIndexes = [];

      hashResults.forEach(function (result, index) {
        if (!hashPresent(result, fieldList)) missingIndexes.push(index);
      });

      if (!missingIndexes.length) {
        return hashResults.map(toPayload);
      }

      var stringKeys = missingIndexes.map(function (index) {
        return entryKey(blogID, entryIDs[index]);
      });

      return redis.mGet(stringKeys).then(function (jsonResults) {
        var byIndex = {};
        missingIndexes.forEach(function (originalIndex, i) {
          byIndex[originalIndex] = jsonResults && jsonResults[i];
        });

        return hashResults.map(function (result, index) {
          if (byIndex[index] !== undefined && byIndex[index] !== null) {
            return parseJSON(byIndex[index]);
          }
          return toPayload(result);
        });
      });
    })
    .then(function (entries) {
      if (!entries) return;

      if (scalarMode) {
        var only = entries[0];
        if (only === undefined || only === null) return callback();
        return callback(only[fields]);
      }

      entries = entries.filter(function (entry) {
        return entry;
      });

      entries = entries.map(function (entry) {
        return entry instanceof Entry ? entry : new Entry(entry);
      });

      if (single) {
        if (!entries[0]) return callback();
        return callback(entries[0]);
      }

      return callback(entries);
    })
    .catch(function (err) {
      console.error(err);

      if (single) return callback();

      return callback([]);
    });

  // Convert one hash read (object from HGETALL or array from HMGET) into a
  // plain, type-coerced object - or null when there was nothing there.
  function toPayload(result) {
    if (!result) return null;

    var raw;

    if (Array.isArray(result)) {
      raw = {};
      fieldList.forEach(function (field, i) {
        if (result[i] !== null && result[i] !== undefined) raw[field] = result[i];
      });
    } else {
      raw = result;
    }

    if (!Object.keys(raw).length) return null;

    return format.deserialize(raw);
  }

  function parseJSON(value) {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error("entry.get: failed to parse JSON entry", e);
      return null;
    }
  }
};

// HGETALL returns {} for a missing hash; HMGET returns [null, null, ...]. Any
// non-null field means the hash exists (an existing entry always has scalar
// fields like path/created set, so "all null" is a genuine miss).
function hashPresent(result, fieldList) {
  if (!result) return false;

  if (fieldList) {
    return result.some(function (value) {
      return value !== null && value !== undefined;
    });
  }

  return Object.keys(result).length > 0;
}
