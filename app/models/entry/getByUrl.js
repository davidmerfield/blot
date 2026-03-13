var ensure = require("helper/ensure");
var redis = require("models/client");
var get = require("./get");
var urlKey = require("./key").url;

module.exports = function getByUrl(blogID, entryUrl, callback) {
  ensure(blogID, "string").and(entryUrl, "string").and(callback, "function");

  // Normalize to decoded form so percent-encoded hrefs (e.g. from Pandoc)
  // resolve to entries stored under decoded URLs (see _setUrl.js).
  try {
    entryUrl = decodeURI(entryUrl);
  } catch (e) {
    // leave as-is if decoding fails (malformed %)
  }

  redis.get(urlKey(blogID, entryUrl), function (error, entryID) {
    if (error) throw error;

    if (entryID === null || entryID === undefined) return callback();

    get(blogID, entryID, callback);
  });
};
