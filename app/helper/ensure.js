var type = require("./type");

function str(len) {
  var res = "";
  while (res.length < len) res += " ";
  return res;
}

function printarr(arr, indent) {
  for (var i = 0; i < arr.length; i++) {
    var comma = i === arr.length - 1 ? "" : ",";
    var variable = arr[i];

    console.log(str(indent) + variable + comma, "(" + type(variable) + ") ");
  }
}

function print(obj, indent) {
  indent = indent || 1;

  if (indent === 1) console.log("{");

  for (var i in obj) {
    var comma = i === Object.keys(obj).slice(-1)[0] ? "" : ",";
    var variable = obj[i];

    if (type(variable, "array")) {
      console.log(str(indent) + '"' + i + '": [');
      printarr(variable, indent + 2);
      console.log(str(indent) + "]" + comma);
      continue;
    }

    if (type(variable, "object")) {
      console.log(str(indent) + '"' + i + '": {');
      print(variable, indent + 2);
      console.log(str(indent) + "}" + comma);
      continue;
    }

    // Prepare variable for printing...
    if (type(variable, "string")) {
      if (variable.length > 100) {
        variable = variable.slice(0, 100) + "...";
      }

      variable = '"' + variable + '"';
    }

    console.log(
      str(indent) + '"' + i + '":',
      variable + comma,
      "(" + type(variable) + ") "
    );
  }

  if (indent === 1) console.log("}");
}

function debug(param, is) {
  console.log();
  console.log("------------------------------------------");

  console.log("Expected:");

  print(is);
  console.log();

  console.log("Actual:");

  print(param);
  console.log();

  console.log("In summary object is:");

  for (var i in is) {
    if (param[i] === undefined) {
      console.log(
        '- missing key "' +
          i +
          '" that is specified in the model with type "' +
          is[i] +
          '".'
      );

      continue;
    }

    if (!type(param[i], is[i])) {
      console.log(
        '- of wrong type for key "' +
          i +
          '" which should be type "' +
          is[i] +
          '".'
      );

      continue;
    }
  }

  for (var x in param) {
    if (!is[x]) {
      console.log('- has key "' + x + '" that is not specified in the model.');
      continue;
    }
  }

  console.log("------------------------------------------");
  console.log();
}

function ensure(param, is, strictly, recursive) {
  if (type(is) === "array") {
    for (var x in param) {
      ensure(param[x], is[0]);
    }

    return { and: ensure };
  }

  var deleted = [];

  if (type(is) === "object") {
    try {
      for (var i in param) {
        if (is[i]) {
          ensure(param[i], is[i], strictly, true);
        } else {
          delete param[i];
          deleted.push(i);
        }
      }

      if (strictly) for (var j in is) ensure(param[j], is[j], strictly, true);
    } catch (e) {
      if (!recursive) debug(param, is);
      throw e;
    }

    if (deleted.length) {
      console.log("Removed extraneous keys " + deleted.join(", "));
    }
  } else if (type(param) !== is)
    throw new TypeError(
      'Param "' + param + '" must be a ' + is + ". Its type is " + type(param)
    );

  return { and: ensure };
}

module.exports = ensure;
