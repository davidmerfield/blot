const desnake = require("./util/desnake");

module.exports = function (req, res, next) {
  const locals = req.template.locals || {};

  res.locals.uploads = Object.keys(locals)
    .filter(key => key.endsWith("_url"))
    .map(key => ({
      key,
      value: locals[key],
      label: desnake(key),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  next();
};
