var _ = require("lodash");
var TYPE = require("./scheme").TYPE;
var type = require("helper/type");

function serialize(sourceObj) {
  // We don't want to modify the
  // obj passed in case we use it
  // elsewhere in future
  var obj = _.cloneDeep(sourceObj);

  for (var i in obj) {
    if (
      type(TYPE[i]) === "object" ||
      type(TYPE[i]) === "array" ||
      TYPE[i] === "object" ||
      TYPE[i] === "array"
    ) {
      obj[i] = JSON.stringify(obj[i]);
    }
  }

  return obj;
}

function deserialize(sourceObj) {
  var obj = _.cloneDeep(sourceObj);

  for (var i in obj) {
    if (
      type(TYPE[i]) === "object" ||
      type(TYPE[i]) === "array" ||
      TYPE[i] === "object" ||
      TYPE[i] === "array"
    )
      obj[i] = JSON.parse(obj[i]);

    if (TYPE[i] === "boolean") obj[i] = obj[i] === "true";

    if (TYPE[i] === "number") obj[i] = parseInt(obj[i]);
  }

  return obj;
}

serialize.de = deserialize;

module.exports = serialize;
