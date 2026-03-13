var key = require("./key");
var client = require("models/client");
var deserialize = require("./util/deserialize");
var metadataModel = require("./metadataModel");

module.exports = function getMetadata(id, callback) {
  client.hgetall(key.metadata(id), function (err, metadata) {
    if (err) return callback(err);

    metadata = deserialize(metadata, metadataModel);

    if (!metadata) {
      err = new Error("No template: " + id);
      err.code = "ENOENT";
      return callback(err, null);
    }

    metadata.cdn = metadata.cdn || {};

    callback(null, metadata);
  });
};
