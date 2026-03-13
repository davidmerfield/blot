var ensure = require("helper/ensure");
var type = require("helper/type");

var redis = require("models/client");
var entryKey = require("./key").entry;

var Entry = require("./instance");

module.exports = function (blogID, entryIDs, callback) {
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

  entryIDs = entryIDs.map(function (entryID) {
    return entryKey(blogID, entryID);
  });

  ensure(entryIDs, "array");

  redis.mget(entryIDs, function (err, entries) {
    if (err) throw err;

    entries = entries || [];

    entries = entries.filter(function (entry) {
      return entry;
    });

    entries = entries.map(function (entry) {
      return new Entry(JSON.parse(entry)); // return value
    });

    if (single) {
      entries = entries[0];
    }

    if (single && !entries) return callback();

    return callback(entries);
  });
};
