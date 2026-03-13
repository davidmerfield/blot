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

  if (metadata.isPublic) {
    client.sadd(key.publicTemplates(), id);
  } else {
    client.srem(key.publicTemplates(), id);
  }

  return setMetadata(id, metadata, callback);
};
