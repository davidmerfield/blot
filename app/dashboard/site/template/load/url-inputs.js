const desnake = require("./util/desnake");
const makeLabel = (key) => desnake(key.slice(0, -"_url".length));

module.exports = function (req, res, next) {
  const locals = req.template.locals || {};

  res.locals.uploads = Object.keys(locals)
    .filter((key) => key.endsWith("_url"))
    .map((key) => ({
      key,
      value: locals[key],
      label: makeLabel(key),
      label_lower: makeLabel(key).toLowerCase(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  next();
};
