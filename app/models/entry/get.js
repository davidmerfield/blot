var ensure = require("helper/ensure");
var type = require("helper/type");

var redis = require("models/client");
var entryHashKey = require("./key").entryHash;
var format = require("./format");

var Entry = require("./instance");

// get(blogID, entryIDs, [fields], callback)
//
// entryIDs may be a single path (string) or an array of paths. Each entry is
// read from its Redis hash - HGETALL, or HMGET when `fields` is given:
//   - undefined  -> whole entry
//   - "title"    -> just that field; for a single-entry lookup the raw value
//                   is passed to the callback instead of an Entry
//   - ["a", "b"] -> an Entry carrying only those fields (plus id, so an array
//                   result stays correlatable with its input positions)
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
  }

  // Every non-scalar narrowed result carries id so callers can correlate the
  // returned entries with their input positions (missing entries are filtered
  // out of the array). scalarMode returns a bare value, so it skips this.
  if (fieldList && !scalarMode && fieldList.indexOf("id") === -1) {
    fieldList.push("id");
  }

  var reads = entryIDs.map(function (entryID) {
    var hashKey = entryHashKey(blogID, entryID);
    return fieldList ? redis.hmGet(hashKey, fieldList) : redis.hGetAll(hashKey);
  });

  Promise.all(reads)
    .then(function (results) {
      var entries = results
        .map(function (result) {
          return toPayload(result, fieldList);
        })
        .filter(function (entry) {
          return entry;
        })
        .map(function (entry) {
          return new Entry(entry);
        });

      if (scalarMode) {
        var only = entries[0];
        return callback(only ? only[fields] : undefined);
      }

      if (single) {
        return entries[0] ? callback(entries[0]) : callback();
      }

      return callback(entries);
    })
    .catch(function (err) {
      console.error(err);

      if (single) return callback();

      return callback([]);
    });
};

// Convert one hash read (object from HGETALL, array from HMGET) into a
// type-coerced plain object - or null when the hash is empty/missing.
function toPayload(result, fieldList) {
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
