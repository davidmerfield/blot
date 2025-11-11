var Template = require("models/template");
var arrayify = require("helper/arrayify");

module.exports = function (req, res, next) {
  Template.getAllViews(req.template.id, function (err, views, template) {
    if (err || !views || !template) return next(new Error("No template"));

    res.locals.getAllViews = { views, template };

    views = arrayify(views);

    views.push({ name: "package.json" });

    views.forEach(function (view) {
      if (req.params.viewSlug && view.name === req.params.viewSlug)
        view.selected = "selected";
      view.extension = {};
      view.extension[view.name.split('.').pop()] = true;
      view.isPackageJSON = view.name === "package.json";
    });

    views = sort(views);
    res.locals.views = views;

    next();
  });
};

function sort(arr) {
  return arr.sort(function (a, b) {
    if (a.name < b.name) return -1;

    if (a.name > b.name) return 1;

    return 0;
  });
}
