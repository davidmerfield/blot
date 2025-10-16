var model = require("./model");

function shouldSerialize(type) {
  return type && type !== "string";
}

function parseField(field, value) {
  if (value === null || value === undefined) return undefined;

  var type = model[field];

  if (!shouldSerialize(type)) return value;

  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
}

function serializeField(field, value) {
  if (value === undefined || value === null) return undefined;

  var type = model[field];

  if (!shouldSerialize(type)) return value;

  return JSON.stringify(value);
}

function serialize(entry, fields) {
  var output = {};

  var keys = fields || Object.keys(model);

  keys.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(entry, field)) return;

    var serialized = serializeField(field, entry[field]);

    if (serialized === undefined) return;

    output[field] = serialized;
  });

  return output;
}

function deserialize(hash) {
  var output = {};

  if (!hash) return output;

  Object.keys(hash).forEach(function (field) {
    var parsed = parseField(field, hash[field]);

    if (parsed === undefined) return;

    output[field] = parsed;
  });

  return output;
}

module.exports = {
  parse: parseField,
  serialize: serialize,
  deserialize: deserialize,
};
