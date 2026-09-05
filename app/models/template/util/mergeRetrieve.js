var extend = require("helper/extend");
var type = require("helper/type");

// helper/extend keeps an existing boolean (e.g. allEntries: true) instead of
// replacing it with a later object (e.g. { fields: { title: true } }).
// Promote those booleans so field projection metadata can merge.
function promoteBooleansForObjectMerge(target, source) {
  if (!type(target, "object") || !type(source, "object")) return;

  Object.keys(source).forEach(function (key) {
    var targetVal = target[key];
    var sourceVal = source[key];

    if (targetVal === true && type(sourceVal, "object")) {
      target[key] = {};
      targetVal = target[key];
    }

    if (type(targetVal, "object") && type(sourceVal, "object")) {
      promoteBooleansForObjectMerge(targetVal, sourceVal);
    }
  });
}

module.exports = function mergeRetrieve(target, source) {
  target = target || {};
  source = source || {};
  promoteBooleansForObjectMerge(target, source);
  extend(target).and(source);
  return target;
};
