var key = require("./key");
var client = require("models/client-new");
var ensure = require("helper/ensure");
var getMultipleViews = require("./getMultipleViews");
var getMetadata = require("./getMetadata");

module.exports = function getAllViews(name, callback) {
  ensure(name, "string").and(callback, "function");

  client
    .sMembers(key.allViews(name))
    .then(function (viewNames) {
      getMetadata(name, function (err, metadata) {
        if (err) return callback(err);

        getMultipleViews(name, viewNames, function (viewErr, views) {
          if (viewErr) return callback(viewErr);
          callback(null, views, metadata);
        });
      });
    })
    .catch(callback);
};
