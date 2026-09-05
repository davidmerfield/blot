var ensure = require("helper/ensure");
var makeID = require("./util/makeID");
var client = require("models/client");
var key = require("./key");
var setMetadata = require("./setMetadata");

module.exports = function update(owner, name, metadata, callback) {
  ensure(owner, "string")
    .and(name, "string")
    .and(metadata, "object")
    .and(callback, "function");

  var id = makeID(owner, name);
  var operation = metadata.isPublic
    ? client.sAdd(key.publicTemplates(), id)
    : client.sRem(key.publicTemplates(), id);

  operation.then(function () {
    return setMetadata(id, metadata, callback);
  }).catch(callback);
};
