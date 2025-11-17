var type = require("./type");

function ensure(variable, expected, strictly, recursive) {
  // true === 'boolean' etc...
  if (type(expected, "string")) return checkString(variable, expected);

  // {foo: 'A', bar: true} === {foo: 'string', bar: 'boolean'}
  // strictly tells us to ensure
  // that all the properties on the
  // expected object exist with the
  // correct types on the variable object
  if (type(expected, "object"))
    return checkObject(variable, expected, strictly, recursive);

  // ['A', 1] === ['string', 'number'] etc...
  if (type(expected, "array"))
    return checkArray(variable, expected, strictly, recursive);

  throw new TypeError("Expected property must be a string, object or array.");
}

function checkString(variable, expected) {
  if (!type(variable, expected)) throw err(variable, expected);
}

function err(variable, expected) {
  return new TypeError(
    [
      "Variable",
      '"' + variable + '"',
      "is of type",
      '"' + type(variable) + '"',
      "and should be type",
      '"' + expected + '"',
    ].join(" ")
  );
}

function checkArray(list, expected, strictly, recursive) {
  list.forEach(function (variable) {
    ensure(variable, expected, strictly, recursive);
  });
}

function checkObject(object, expected, strictly, recursive) {
  for (var key in object) {
    if (expected[key] === undefined) {
      delete object[key];
      console.log("Warning: removed uneeded key", key, "object");
      continue;
    }

    ensure(object[key], expected[key], strictly, true);
  }
}

module.exports = ensure;
