var ensure = require("helper/ensure");
var type = require("helper/type");

var redis = require("models/client");
var keys = require("./key");
var format = require("./format");

var Entry = require("./instance");

module.exports = function (blogID, entryIDs, fields, callback) {
  ensure(blogID, "string");

  if (type(entryIDs, "function")) {
    callback = entryIDs;
    entryIDs = undefined;
    fields = undefined;
  }

  if (type(fields, "function")) {
    callback = fields;
    fields = undefined;
  }

  ensure(callback, "function");

  var singleEntry = false;
  var singleField = false;
  var requestedFields;

  if (entryIDs === undefined) entryIDs = [];

  if (type(entryIDs, "array") && !entryIDs.length) {
    return callback([]);
  }

  if (type(entryIDs, "string")) {
    singleEntry = true;
    entryIDs = [entryIDs];
  }

  ensure(entryIDs, "array");

  if (fields !== undefined) {
    if (type(fields, "string")) {
      requestedFields = [fields];
      singleField = true;
    } else if (type(fields, "array")) {
      requestedFields = fields;
    } else {
      throw new Error("Fields must be a string or an array");
    }
  }

  var hashKeys = entryIDs.map(function (entryID) {
    return keys.entryHash(blogID, entryID);
  });

  var jsonKeys = entryIDs.map(function (entryID) {
    return keys.entry(blogID, entryID);
  });

  var batch = redis.batch();

  hashKeys.forEach(function (hashKey) {
    if (requestedFields) batch.hmget(hashKey, requestedFields);
    else batch.hgetall(hashKey);
  });

  batch.exec(function (err, replies) {
    if (err) throw err;

    replies = replies || [];

    var entries = new Array(entryIDs.length);
    var missing = [];

    replies.forEach(function (reply, index) {
      if (requestedFields) {
        var values = Array.isArray(reply) ? reply : [];
        var hasValue = values.some(function (value) {
          return value !== null && value !== undefined;
        });

        if (!hasValue) {
          missing.push(index);
          return;
        }

        var partial = {};

        requestedFields.forEach(function (field, fieldIndex) {
          var raw = values[fieldIndex];
          if (raw === null || raw === undefined) return;
          partial[field] = format.parse(field, raw);
        });

        entries[index] = partial;
      } else {
        if (!reply || !Object.keys(reply).length) {
          missing.push(index);
          return;
        }

        var deserialized = format.deserialize(reply);
        entries[index] = new Entry(deserialized);
      }
    });

    if (!missing.length) {
      return finalize(entries);
    }

    var fallbackKeys = missing.map(function (index) {
      return jsonKeys[index];
    });

    redis.mget(fallbackKeys, function (err, jsonEntries) {
      if (err) throw err;

      jsonEntries = jsonEntries || [];

      jsonEntries.forEach(function (json, offset) {
        if (!json) return;

        var parsed;

        try {
          parsed = JSON.parse(json);
        } catch (e) {
          return;
        }

        var targetIndex = missing[offset];

        if (requestedFields) {
          var partial = {};

          requestedFields.forEach(function (field) {
            if (!Object.prototype.hasOwnProperty.call(parsed, field)) return;
            partial[field] = parsed[field];
          });

          entries[targetIndex] = partial;
        } else {
          entries[targetIndex] = new Entry(parsed);
        }
      });

      finalize(entries);
    });
  });

  function finalize(entries) {
    var existing = entries.filter(function (entry) {
      return entry !== undefined;
    });

    if (!requestedFields) {
      if (singleEntry) {
        var entry = existing[0];
        if (!entry) return callback();
        return callback(entry);
      }

      return callback(existing);
    }

    var results = existing.map(function (entry) {
      return entry || {};
    });

    if (singleField) {
      var fieldName = requestedFields[0];

      results = results.map(function (entry) {
        if (
          entry &&
          Object.prototype.hasOwnProperty.call(entry, fieldName)
        ) {
          return entry[fieldName];
        }
        return undefined;
      });

      if (singleEntry) {
        if (!results.length) return callback();
        return callback(results[0]);
      }

      return callback(results);
    }

    if (singleEntry) {
      if (!results.length) return callback();
      return callback(results[0]);
    }

    return callback(results);
  }
};
