var key = require("./key");
var client = require("models/client");
var ensure = require("helper/ensure");
var getMultipleViews = require("./getMultipleViews");
var getMetadata = require("./getMetadata");

module.exports = function getAllViews(name, callback) {
  ensure(name, "string").and(callback, "function");

  client.smembers(key.allViews(name), function (err, viewNames) {
    getMetadata(name, function (err, metadata) {
      if (err) return callback(err);
      getMultipleViews(name, viewNames, function (err, views) {
        if (err) return callback(err);
        callback(err, views, metadata);
      });
    });
  });
};
