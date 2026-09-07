var extend = require("helper/extend");
var type = require("helper/type");

// A boolean retrieve value (e.g. allEntries: true) means "this local is used
// but we don't know which fields" — it must block field projection. When it
// meets a recalculated { fields: { ... } } object from the other side of a
// merge, the boolean has to win, otherwise the merged metadata becomes a
// restrictive whitelist and projection can delete a field the boolean side
// actually renders. This happens whenever a view and one of its partials are
// saved / recalculated independently.
function blockingBooleansWin(target, source) {
  Object.keys(source).forEach(function (key) {
    var targetVal = target[key];
    var sourceVal = source[key];

    if (targetVal === true && type(sourceVal, "object")) {
      // extend() already keeps target's boolean over source's object, but be
      // explicit so intent is obvious.
      target[key] = true;
      return;
    }

    if (sourceVal === true && type(targetVal, "object")) {
      target[key] = true;
      return;
    }

    if (type(targetVal, "object") && type(sourceVal, "object")) {
      blockingBooleansWin(targetVal, sourceVal);
    }
  });
}

module.exports = function mergeRetrieve(target, source) {
  target = target || {};
  source = source || {};
  blockingBooleansWin(target, source);
  extend(target).and(source);
  return target;
};
