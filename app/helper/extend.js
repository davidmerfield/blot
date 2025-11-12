var type = require("./type");
var ensure = require("./ensure");

function extend(a) {
  if (a === undefined) a = {};

  return {
    and: function next(b) {
      softMerge(a, b);

      return extend(a);
    },
  };
}

// if property on a is set, use it,
// if not, use B's value
// Arrays are merged (union) when both exist
function softMerge(a, b) {
  ensure(a, "object").and(b, "object");

  for (var i in b) {
    // If both are arrays, merge them (union with deduplication and sorting)
    if (type(a[i]) === "array" && type(b[i]) === "array") {
      var combined = a[i].concat(b[i]);
      a[i] = [...new Set(combined)].sort();
      continue;
    }

    // If both are objects, recursively merge
    if (type(a[i]) === "object" && type(b[i]) === "object") {
      softMerge(a[i], b[i]);
      continue;
    }

    // Otherwise, soft merge (only set if undefined)
    if (a[i] === undefined) {
      a[i] = b[i];
    }
  }
}


module.exports = extend;
