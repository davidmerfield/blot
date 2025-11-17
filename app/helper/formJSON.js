var ensure = require("./ensure");
var type = require("./type");
var arrayify = require("./arrayify");

// how to implement some rudimentary type coercion?
// would be nice to coerce strings -> numbs
// and strings -> bools

function formJSON(fields, model) {
  // console.log(fields);
  // console.log(model);

  if (model === undefined) model = {};

  ensure(fields, "object").and(model, "object");

  var obj = {};

  for (var i in fields) {
    // Sometimes there are multiple values
    // for one field. Collapse them to one.
    if (type(fields[i]) === "array") {
      fields[i] = fields[i].pop();
      console.log("FormJSON: Multiple inputs with same name", i, fields[i]);
    }

    var terms = i.split("."),
      totalTerms = terms.length,
      val = fields[i];

    var parent = obj,
      modelDef = model;

    for (var j = 0; j < terms.length; j++) {
      var key = terms[j];

      // Recurse down the model tree too
      // until we reach a definition
      if (modelDef && modelDef[key]) {
        modelDef = modelDef[key];
      } else {
        modelDef = false;
      }

      parent[key] = parent[key] || {};

      // At the leaf node
      // final term in list of terms
      if (j + 1 === totalTerms) {
        // At lowest level of type definition
        // and the types do not match
        if (type(modelDef) === "string" && type(val) !== modelDef) {
          try {
            if (modelDef === "string") val += "";

            if (modelDef === "number") val = parseFloat(val);

            if (modelDef === "boolean") {
              if (val === "off") {
                val = false;
              } else if (val === "on") {
                val = true;
              } else {
                val = parseBool(val);
              }
            }

            if (modelDef === "object" || modelDef === "array")
              val = JSON.parse(val);
          } catch (e) {
            console.log(
              "Could not coerce val to desired " +
                modelDef +
                " it is currently: "
            );
            console.log(val);
            console.log();
            console.log(e);
          }
        }

        parent[key] = val;
      }

      parent = parent[key];
    }
  }

  function catchArrays(obj, model) {
    for (var i in obj) {
      // console.log(i);

      if (type(model[i]) === "array") {
        obj[i] = arrayify(obj[i], function (item) {
          // arrayidy adds cruft like the name property
          // make sure we remove anything thats not in the
          // model definition for this item
          for (var x in item)
            if (model[i][0][x] === undefined) {
              delete item[x];
            }

          // this fixes a bug with nested objects in arrays
          // and is neccessary for blog.menu
          if (!Object.keys(item).length) return false;

          return item;
        });
      }

      if (type(model[i]) === "object") {
        // console.log(obj[i]);
        // console.log(model[i]);

        catchArrays(obj[i], model[i]);
      }
    }
  }

  catchArrays(obj, model);

  ensure(obj, model);

  return obj;
}

function parseBool(string) {
  switch (string.trim().toLowerCase()) {
    case "true":
    case "yes":
    case "1":
      return true;
    case "false":
    case "no":
    case "0":
    case null:
      return false;
    default:
      return Boolean(string);
  }
}

module.exports = formJSON;
