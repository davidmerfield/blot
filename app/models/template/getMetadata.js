var key = require("./key");
var client = require("models/client-new");
var deserialize = require("./util/deserialize");
var metadataModel = require("./metadataModel");

module.exports = function getMetadata(id, callback) {
  client.hGetAll(key.metadata(id)).then(function (metadata) {

    metadata = deserialize(metadata, metadataModel);

    if (!metadata) {
      err = new Error("No template: " + id);
      err.code = "ENOENT";
      return callback(err, null);
    }

    metadata.cdn = metadata.cdn || {};

    callback(null, metadata);
  }).catch(callback);
};
