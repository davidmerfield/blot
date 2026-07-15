var _ = require("lodash");
var ensure = require("helper/ensure");

module.exports = function serialize(sourceObj, model) {
  ensure(sourceObj, model);

  // We don't want to modify the
  // obj passed in case we use it
  // elsewhere in future
  var obj = _.cloneDeep(sourceObj);

  for (var i in obj) {
    if (model[i] === "object" || model[i] === "array") {
      obj[i] = JSON.stringify(obj[i]);
      continue;
    }

    if (model[i] === "boolean" && obj[i] !== undefined && obj[i] !== null) {
      obj[i] = obj[i] === true || obj[i] === "true" ? "true" : "false";
      continue;
    }

    if (model[i] === "number" && obj[i] !== undefined && obj[i] !== null) {
      obj[i] = String(obj[i]);
    }
  }

  return obj;
};
