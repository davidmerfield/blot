var ensure = require("helper/ensure");
var redis = require("models/client");
var get = require("./get");
var urlKey = require("./key").url;

module.exports = function getByUrl(blogID, entryUrl, callback) {
  ensure(blogID, "string").and(entryUrl, "string").and(callback, "function");

  redis.get(urlKey(blogID, entryUrl), function (error, entryID) {
    if (error) return callback(error);

    if (entryID === null || entryID === undefined) return callback(null);

    get(blogID, entryID, callback);
  });
};
